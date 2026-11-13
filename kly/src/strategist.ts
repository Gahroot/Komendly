// Daily strategist (Codex, medium): reads arm stats + recent replies, proposes new variants (variable parts only,
// validated by the same compliance checks), and writes a short insight. Bounded: <= MAX_ACTIVE arms per copy/angle
// dimension, <= 3 new segments a day.
import { COPY_STYLE_GUIDE } from "../../src/lib/ads/outbound/copy";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ask, type AIProvider } from "./ai";
import { checkArmContent, DIMENSIONS, MAX_ACTIVE, MAX_ACTIVE_SEGMENTS, posteriorMean } from "./arms";
import type { Db } from "./db";
import { addCost, dayStart, decide, decidedSince } from "./settings";
import { audienceOf, METROS } from "./targets";

export const ProposalSchema = z.object({
  insight: z.string().max(600),
  newArms: z
    .array(
      z.object({
        dimension: z.enum(DIMENSIONS),
        key: z.string().min(2).max(40),
        template: z.string().max(900).optional(),
        instruction: z.string().max(300).optional(),
        goal: z.string().optional(),
        awareness: z.string().optional(),
        niche: z.string().optional(),
        city: z.string().optional(),
        audience: z.enum(["local", "agency"]).optional(),
        rationale: z.string().max(300),
      }),
    )
    .max(6),
});
type Proposal = z.infer<typeof ProposalSchema>["newArms"][number];

export function proposalContent(p: Proposal): Record<string, unknown> {
  switch (p.dimension) {
    case "subject":
    case "body":
    case "followup":
      return { template: p.template ?? "", ...(p.audience === "agency" ? { audience: "agency" } : {}) };
    case "opener_style":
      return { instruction: p.instruction ?? "" };
    case "ad_angle":
      return { goal: p.goal ?? "", awarenessMix: p.awareness ? { [p.awareness]: 1 } : {} };
    case "segment":
    {
      const niche = (p.niche ?? "").toLowerCase().trim();
      return { niche, cities: p.city?.trim() ? [p.city.trim()] : METROS, audience: p.audience ?? audienceOf(niche) };
    }
    default:
      return {};
  }
}

/** Which proposals may be added: valid content, unique key, room in the dimension. */
export function acceptProposals(props: readonly Proposal[], active: Record<string, number>, existingKeys: ReadonlySet<string>): Array<{ p: Proposal; content: Record<string, unknown> }> {
  const room = { ...active };
  const out: Array<{ p: Proposal; content: Record<string, unknown> }> = [];
  let segments = 0;
  for (const p of props) {
    const content = proposalContent(p);
    const cities = Array.isArray(content.cities) ? (content.cities as string[]) : [];
    const key = p.dimension === "segment" ? (cities.length === 1 ? `${String(content.niche)}|${cities[0]}` : String(content.niche)) : p.key.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    // gift_timing is a fixed two-way test, not something to invent new variants for.
    if (p.dimension === "gift_timing" || checkArmContent(p.dimension, content) || existingKeys.has(`${p.dimension}:${key}`)) continue;
    const limit = p.dimension === "segment" ? MAX_ACTIVE_SEGMENTS : MAX_ACTIVE;
    if ((room[p.dimension] ?? 0) >= limit) continue;
    if (p.dimension === "segment" && ++segments > 3) continue;
    room[p.dimension] = (room[p.dimension] ?? 0) + 1;
    out.push({ p: { ...p, key }, content });
  }
  return out;
}

const SYSTEM = [
  "You are Kly's strategist. Kly emails local US businesses a free Facebook/Instagram ad that Ozzy (Komendly's ad wizard) made from their website, then tries to turn them into paying Komendly customers.",
  "Given experiment stats and recent replies, write a 2-4 sentence insight and propose at most 6 new variants for weak spots.",
  COPY_STYLE_GUIDE,
  "Only propose subject, body, followup, ad_angle or segment (never opener_style). Never claim results, prices, urgency, or a relationship we don't have.",
  "ad_angle: goal one of leads|sales|awareness|traffic|auto and awareness one of unaware|problem_aware|solution_aware|product_aware|most_aware.",
  "segment: a niche of businesses that can pay for ads (plural, lowercase, e.g. 'med spas', 'pool builders', 'marketing agencies'), optional city 'City, ST' (omit to search all metros), audience local|agency. Favor niches with high customer value and heavy ad spend, and niches like those that converted.",
  "Copy variants may set audience agency (pitch: speed across all their clients); default is local businesses.",
].join(" ");

export async function strategistTick(db: Db, provider: AIProvider | null, now: Date): Promise<string | null> {
  if (!provider || (await decidedSince(db, "insight", dayStart(now)))) return null;
  const arms = await db.klyArm.findMany({ where: { status: { not: "retired" } }, orderBy: [{ dimension: "asc" }, { key: "asc" }] });
  const stat = (a: (typeof arms)[number]) => `${a.dimension}/${a.key} [${a.status}] sends=${a.sends} clicks=${a.clicks} replies=${a.replies} positive=${a.positiveReplies} signups=${a.signups} paid=${a.paid} rev=$${(a.revenueCents / 100).toFixed(0)} score=${posteriorMean(a).toFixed(3)}`;
  const copy = arms.filter((a) => a.dimension !== "segment").map((a) => `${stat(a)} :: ${JSON.stringify(a.content).slice(0, 300)}`);
  const segs = arms.filter((a) => a.dimension === "segment").sort((a, b) => posteriorMean(b) - posteriorMean(a) || a.key.localeCompare(b.key)).slice(0, 25).map(stat);
  const replies = await db.outboundSend.findMany({ where: { replied: true, replySnippet: { not: null } }, orderBy: { sentAt: "desc" }, take: 15, select: { replySnippet: true, lead: { select: { replyIntent: true, niche: true } } } });
  const r = await ask(provider, ProposalSchema, {
    system: SYSTEM,
    prompt: [`Copy/angle arms:\n${copy.join("\n")}`, `Top segments:\n${segs.join("\n")}`, `Recent replies:\n${replies.map((x) => `[${x.lead.replyIntent ?? "?"} ${x.lead.niche}] ${(x.replySnippet ?? "").slice(0, 200)}`).join("\n") || "(none yet)"}`].join("\n\n"),
    reasoning: "medium",
  });
  await addCost(db, null, r.costMicros, now);
  const active: Record<string, number> = {};
  for (const a of arms) active[a.dimension] = (active[a.dimension] ?? 0) + 1;
  const keys = new Set((await db.klyArm.findMany({ select: { dimension: true, key: true } })).map((a) => `${a.dimension}:${a.key}`));
  for (const { p, content } of acceptProposals(r.out.newArms, active, keys)) {
    await db.klyArm.create({ data: { dimension: p.dimension, key: p.key, content: content as Prisma.InputJsonValue, origin: "ai", rationale: p.rationale } });
    await decide(db, p.dimension === "segment" ? "segment" : "arm_new", `New ${p.dimension} variant "${p.key}": ${p.rationale}`, { dimension: p.dimension, key: p.key });
  }
  await decide(db, "insight", r.out.insight || "No change today.", { arms: arms.length });
  return r.out.insight;
}

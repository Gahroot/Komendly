// Offer-intelligence weekly job (growth system offer_intel; off until AdsFeatureFlag sys_offer_intel). Single replica.
// Reads objections (replies, churn reasons, unsubscribes), the revenue snapshot and verified competitor offers; the Codex
// provider writes an offer-gap analysis (Hormozi value equation) and up to 3 copy experiments. Each proposal is stored as
// AdsEvent offer_proposal: auto-approved (-> defineExperiment) ONLY when the pure validator + AI review gate + truth check
// all pass; otherwise status needs_owner. Also runs the page-coherence check and the read-only pricing analysis.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import { defineExperiment, loadRunningExperiments } from "../../../src/lib/revenue/experiments";
import { computeEconomics, loadEconomicsInput } from "../../../src/lib/revenue/economics";
import { parseSnapshot } from "../../../src/lib/optimizer/diagnose";
import { z } from "zod";
import { AGENT_SYSTEM, buildAgentPrompt, LEVERS, PAYLOAD_SLOTS, toExperimentDef, type AgentProposal } from "../../../src/lib/offer-intel/agent";
import { buildObjectionMap, type Signal } from "../../../src/lib/offer-intel/objections";
import { validateProposal } from "../../../src/lib/offer-intel/validate";
import { payloadProblems } from "../../../src/lib/offer-intel/surfaces";
import { analysePricing } from "../../../src/lib/offer-intel/pricing";
import { checkCoherence, htmlToText, type CoherenceIssue, type PageText } from "../../../src/lib/offer-intel/coherence";
import competitors from "../../../src/lib/offer-intel/competitors.json";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { structured } from "../providers/structured";
import type { AIProvider } from "../providers/types";
import { gate } from "../growth/review-gate";

const Payload = z.object(Object.fromEntries(PAYLOAD_SLOTS.map((k) => [k, z.string()])) as Record<(typeof PAYLOAD_SLOTS)[number], z.ZodString>);
const AgentOutput = z.object({
  gap: z.object({ weakestLever: z.enum(LEVERS), scores: z.object({ dream_outcome: z.number().min(1).max(5), perceived_likelihood: z.number().min(1).max(5), time_delay: z.number().min(1).max(5), effort_sacrifice: z.number().min(1).max(5) }), evidence: z.string().max(900), summary: z.string().max(500) }),
  proposals: z.array(z.object({ key: z.string().max(60), surface: z.string(), lever: z.enum(LEVERS), hypothesis: z.string().max(400), rationale: z.string().max(400), metric: z.string(), minPerVariant: z.number(), variant: z.object({ id: z.string().max(40), payload: Payload }) })).max(3),
});
const WEEK_MS = 7 * 86_400_000;
const SIGNAL_DAYS = 60;
export interface OfferIntelDeps { db: Db; provider: AIProvider | null; env?: NodeJS.ProcessEnv; now?: () => Date; fetchPage?: (url: string) => Promise<string> }
export interface OfferIntelResult { ran: boolean; reason?: string; signals?: number; proposals?: number; auto?: number; coherence?: number; ownerDecisions?: number }

const json = (v: unknown) => JSON.parse(JSON.stringify(v));
const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function collectSignals(db: Db, now: Date): Promise<Signal[]> {
  const since = new Date(now.getTime() - SIGNAL_DAYS * 86_400_000);
  const rows = await db.adsEvent.findMany({ where: { name: { in: ["email_replied", "email_needs_human", "email_auto_replied", "churn_reason", "email_unsubscribed"] }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 1500, select: { name: true, props: true, createdAt: true } });
  return rows.flatMap((r) => {
    const p = (r.props ?? {}) as Record<string, unknown>;
    const text = [str(p.text), str(p.subject), str(p.reason), str(p.category), str(p.note)].filter(Boolean).join(" ").slice(0, 600);
    return text ? [{ source: r.name, text, at: r.createdAt.toISOString() }] : [];
  });
}

async function abandonedCheckouts(db: Db, now: Date): Promise<string> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [started, recovered] = await Promise.all([db.adsEvent.count({ where: { name: "checkout_started", createdAt: { gte: since } } }), db.adsEvent.count({ where: { name: "checkout_recovered", createdAt: { gte: since } } })]);
  return `Checkouts started (30d): ${started}; recovered after reminder: ${recovered}.`;
}

async function liveAndLifecyclePages(d: OfferIntelDeps): Promise<PageText[]> {
  const base = (d.env?.LIFECYCLE_APP_URL || d.env?.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");
  const get = d.fetchPage ?? (async (u: string) => (await fetch(u, { signal: AbortSignal.timeout(15_000) })).text());
  const pages: PageText[] = [];
  for (const p of ["/", "/free-ads", "/pricing", "/ads/team"]) {
    try { pages.push({ id: `live:${p}`, text: htmlToText(await get(base + p)) }); } catch (e) { log("warn", "offer-intel page fetch failed", { p, error: errMsg(e) }); }
  }
  try {
    const { readdirSync } = await import("node:fs");
    const dir = join(process.cwd(), "src/lib/ads/lifecycle");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) pages.push({ id: `src/lib/ads/lifecycle/${f}`, text: readFileSync(join(dir, f), "utf8") });
  } catch { /* lifecycle sources not in this image: live pages only */ }
  return pages;
}

export async function runCoherence(d: OfferIntelDeps, now: Date): Promise<CoherenceIssue[]> {
  const issues = checkCoherence(await liveAndLifecyclePages(d));
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const fresh: CoherenceIssue[] = [];
  for (const i of issues) {
    const dup = await d.db.adsEvent.findFirst({ where: { name: "coherence_issue", createdAt: { gte: since }, props: { path: ["issueKey"], equals: i.issueKey } }, select: { id: true } });
    if (dup) continue;
    await d.db.adsEvent.create({ data: { name: "coherence_issue", props: { ...i, summary: `${i.page}: ${i.kind} says ${i.found}, expected ${i.expected}`, level: "measured" } } });
    fresh.push(i);
  }
  return fresh;
}

export async function offerIntelTick(d: OfferIntelDeps): Promise<OfferIntelResult> {
  const now = (d.now ?? (() => new Date()))();
  if (!(await systemEnabled(d.db, "offer_intel"))) return { ran: false, reason: "flag off" };
  const last = await d.db.adsEvent.findFirst({ where: { name: "offer_intel_report" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last && now.getTime() - last.createdAt.getTime() < WEEK_MS - 3_600_000) return { ran: false, reason: "ran this week" };
  const week = now.toISOString().slice(0, 10);
  const res: OfferIntelResult = { ran: true, proposals: 0, auto: 0 };

  // 1. coherence + pricing (no AI)
  res.coherence = (await runCoherence(d, now).catch((e) => { log("warn", "coherence failed", { error: errMsg(e) }); return [] as CoherenceIssue[]; })).length;
  let economics: ReturnType<typeof computeEconomics> | null = null;
  try { economics = computeEconomics(await loadEconomicsInput(d.db as never, now)); } catch (e) { log("warn", "economics unavailable", { error: errMsg(e) }); }
  const pricing = analysePricing(economics);
  for (const dec of pricing.decisions.slice(0, 3)) {
    await d.db.adsEvent.create({ data: { name: "optimizer_action", props: { type: "owner_decision", source: "offer_intel", reason: dec.title, params: { title: dec.title, detail: dec.body }, ok: true, result: "raised for the owner", evidence_level: pricing.inputs.source === "measured" ? "inferred" : "assumed", reversible: "Nothing changes until the owner decides.", week } } });
  }
  res.ownerDecisions = Math.min(3, pricing.decisions.length);

  // 2. objection map + gap + proposals
  const signals = await collectSignals(d.db, now);
  const map = buildObjectionMap(signals);
  const snap = parseSnapshot((await d.db.adsEvent.findFirst({ where: { name: "revenue_snapshot" }, orderBy: { createdAt: "desc" }, select: { props: true } }))?.props);
  const funnel = `${snap.funnel?.map((f) => `${f.step}: ${f.count}`).join(", ") || "no snapshot yet"}. ${await abandonedCheckouts(d.db, now)}`;
  const constraint = snap.constraints?.[0] ? `Current constraint: ${snap.constraints[0].name}.` : "Constraint unknown.";
  res.signals = map.total;
  const running = await loadRunningExperiments(d.db as never);
  let gap: unknown = null;
  let proposals: AgentProposal[] = [];
  if (d.provider?.name === "codex" && (map.total >= 5 || snap.funnel?.length)) {
    const usage: never[] = [];
    const out = await structured(d.provider, AgentOutput, { system: AGENT_SYSTEM, prompt: buildAgentPrompt({ themes: map.themes, signalTotal: map.total, funnel, constraint, competitors: competitors.competitors.map((c) => ({ name: c.name, facts: c.facts })), running }), reasoning: "medium", signal: AbortSignal.timeout(180_000) }, usage);
    gap = out.gap;
    proposals = out.proposals;
  }
  const flagOn = true;
  const live = [...running];
  for (const p of proposals) {
    const def = toExperimentDef(p);
    const dup = await d.db.adsEvent.findFirst({ where: { name: "offer_proposal", createdAt: { gte: new Date(now.getTime() - 60 * 86_400_000) }, props: { path: ["def", "key"], equals: def.key } }, select: { id: true } });
    if (dup) continue;
    // AI review gate on the copy that would go live (only when the rule checks already pass: saves calls).
    const pre = validateProposal(def, { running: live, reviewApproved: true, flagOn });
    let reviewApproved: boolean | null = null;
    let reviewReasons: string[] = [];
    if (pre.decision === "auto" && d.provider) {
      const content = def.variants.slice(1).map((v) => JSON.stringify(v.payload)).join("\n");
      const verdict = await gate(d.db, d.provider, { system: "offer_intel", kind: "copy", itemKey: `offer:${def.key}`, content, facts: "Offer facts: see PUBLIC_OFFER. Tokens like {first} are replaced with the real price at render time." });
      reviewApproved = verdict.approved;
      reviewReasons = verdict.verdict.reasons ?? [];
    }
    const decision = validateProposal(def, { running: live, reviewApproved, flagOn });
    let status: "approved" | "needs_owner" = "needs_owner";
    if (decision.decision === "auto") {
      const bad = def.variants.slice(1).flatMap((v) => payloadProblems(def.surface, v.payload));
      if (!bad.length) { await defineExperiment(d.db as never, def); live.push(def); status = "approved"; res.auto = (res.auto ?? 0) + 1; }
    }
    await d.db.adsEvent.create({ data: { name: "offer_proposal", props: json({ status, def, lever: p.lever, rationale: p.rationale, reasons: [...decision.reasons, ...reviewReasons], summary: `${p.lever}: ${p.hypothesis}`, source: "offer_intel", level: "inferred", sampleSize: map.total, surface: def.surface, week }) } });
    res.proposals = (res.proposals ?? 0) + 1;
  }
  await d.db.adsEvent.create({ data: { name: "offer_intel_report", props: json({ week, signals: map.total, classified: map.classified, objectionMap: map.themes, gap, funnel, constraint, competitorsVerifiedOn: competitors.verifiedOn, pricing: pricing.results, pricingInputs: pricing.inputs, coherenceNew: res.coherence, proposals: res.proposals, auto: res.auto, summary: `Offer intel ${week}: ${map.total} signals, ${res.proposals} proposals (${res.auto} auto), ${res.coherence} new coherence issues`, level: "inferred", sampleSize: map.total }) } });
  return res;
}

export function startOfferIntelLoop(deps: OfferIntelDeps, everyMs = 6 * 3_600_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    offerIntelTick(deps)
      .then((r) => (r.ran ? recordSystemRun(deps.db, "offer_intel", { ok: true, outputs: (r.proposals ?? 0) + (r.coherence ?? 0) + 1 }) : undefined))
      .catch((e) => { log("warn", "offer-intel tick failed", { error: errMsg(e) }); return recordSystemRun(deps.db, "offer_intel", { ok: false, error: errMsg(e) }); })
      .finally(() => { running = false; });
  };
  const first = setTimeout(tick, 300_000);
  const t = setInterval(tick, everyMs);
  return () => { clearTimeout(first); clearInterval(t); };
}

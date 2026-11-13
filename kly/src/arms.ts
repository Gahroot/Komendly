// Experiment arms (KlyArm): seeding, Thompson-sampling assignment, stats from lead outcomes, champions/retirement.
// Reward ladder (per contacted lead, in [0,1]): click 0.1 < positive reply 0.3 < signup 0.6 < paid 1.0 (+revenue).
import type { Prisma } from "@prisma/client";
import { AD_GOALS, AWARENESS_LEVELS } from "../../src/lib/ads/contracts";
import { checkVariant, EMAIL_FORMATS, GIFT_TIMINGS, SEED_COPY, type CopyDimension, type GiftTiming } from "../../src/lib/ads/outbound/copy";
import type { Db } from "./db";
import { decide } from "./settings";
import { METROS, NICHES, type Audience } from "./targets";

export const DIMENSIONS = ["subject", "body", "opener_style", "followup", "format", "ad_angle", "segment", "gift_timing"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const MAX_ACTIVE = 5;
export const MAX_ACTIVE_SEGMENTS = 200;
export const MIN_SAMPLES = 50;
export const MIN_ACTIVE = 2;

export interface ArmStats {
  id: string;
  dimension: string;
  key: string;
  status: string;
  sends: number;
  clicks: number;
  positiveReplies: number;
  signups: number;
  paid: number;
  revenueCents: number;
}

/** Outcome of one contacted lead as a reward in [0,1]. */
export function leadReward(o: { clicked: boolean; positive: boolean; signedUp: boolean; paid: boolean; revenueCents: number }): number {
  if (o.paid) return Math.min(1, 0.85 + Math.min(o.revenueCents, 50_000) / 50_000 * 0.15);
  if (o.signedUp) return 0.6;
  if (o.positive) return 0.3;
  if (o.clicked) return 0.1;
  return 0;
}

/** Beta posterior from aggregate counts (each outcome counted at its highest rung). */
export function posterior(a: Pick<ArmStats, "sends" | "clicks" | "positiveReplies" | "signups" | "paid" | "revenueCents">): { alpha: number; beta: number } {
  const n = Math.max(0, a.sends);
  const paid = Math.min(a.paid, n);
  const signups = Math.min(Math.max(0, a.signups - paid), n - paid);
  const positive = Math.min(Math.max(0, a.positiveReplies - a.signups), n - paid - signups);
  const clicks = Math.min(Math.max(0, a.clicks - positive - signups - paid), n - paid - signups - positive);
  const revBonus = paid > 0 ? Math.min(paid * 0.15, (a.revenueCents / 50_000) * 0.15) : 0;
  const s = Math.min(n, paid * 0.85 + revBonus + signups * 0.6 + positive * 0.3 + clicks * 0.1);
  return { alpha: 1 + s, beta: 1 + n - s };
}

export function posteriorMean(a: Parameters<typeof posterior>[0]): number {
  const p = posterior(a);
  return p.alpha / (p.alpha + p.beta);
}

export type Rng = () => number;

/** Seeded deterministic RNG (mulberry32). */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Marsaglia-Tsang gamma sampler (shape >= 1 here since alpha, beta >= 1). */
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(Math.max(rng(), 1e-12), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(alpha: number, beta: number, rng: Rng): number {
  const x = gamma(alpha, rng);
  const y = gamma(beta, rng);
  return x / (x + y);
}

/** Thompson sampling with `explorationPct`% uniform exploration. Arms must be non-retired. */
export function pickArm<T extends Parameters<typeof posterior>[0] & { id: string }>(arms: readonly T[], rng: Rng, explorationPct: number): T | null {
  if (arms.length === 0) return null;
  const sorted = [...arms].sort((a, b) => a.id.localeCompare(b.id));
  if (rng() * 100 < explorationPct) return sorted[Math.floor(rng() * sorted.length)] ?? null;
  let best: T | null = null;
  let bestV = -1;
  for (const a of sorted) {
    const p = posterior(a);
    const v = sampleBeta(p.alpha, p.beta, rng);
    if (v > bestV) {
      bestV = v;
      best = a;
    }
  }
  return best;
}

export interface Verdicts {
  champion: string | null;
  retire: string[];
}

/** Champion = best mean with >= MIN_SAMPLES; retire arms clearly worse (upper ~95% bound below the champion's mean). */
export function judgeArms(arms: readonly ArmStats[], minSamples = MIN_SAMPLES): Verdicts {
  const live = arms.filter((a) => a.status !== "retired");
  const mature = live.filter((a) => a.sends >= minSamples).sort((a, b) => posteriorMean(b) - posteriorMean(a) || a.id.localeCompare(b.id));
  const champ = mature[0];
  if (!champ) return { champion: null, retire: [] };
  const cm = posteriorMean(champ);
  const retire: string[] = [];
  let remaining = live.length;
  for (const a of mature.slice(1).reverse()) {
    if (remaining <= MIN_ACTIVE) break;
    const p = posterior(a);
    const n = p.alpha + p.beta;
    const mean = p.alpha / n;
    const sd = Math.sqrt((mean * (1 - mean)) / (n + 1));
    if (mean + 2 * sd < cm) {
      retire.push(a.id);
      remaining--;
    }
  }
  return { champion: champ.id, retire };
}

// ---------------------------------------------------------------------------
// Seeds

/** @deprecated kept for older imports; the catalog lives in ./targets. */
export const SEED_NICHES = NICHES.map((n) => n.niche);
export const SEED_CITIES = METROS;

export interface SeedArm {
  dimension: Dimension;
  key: string;
  content: Record<string, unknown>;
}

export function seedArms(): SeedArm[] {
  const out: SeedArm[] = [
    ...SEED_COPY.map((c) => ({ dimension: c.dimension as Dimension, key: c.key, content: { template: c.template, ...(c.audience === "agency" ? { audience: "agency" } : {}), timing: c.timing } })),
    // Gift made before the email (ad in the email) vs drawn live when the prospect opens the link (no AI spend on
    // the ~98% who never click, so volume isn't capped by the Codex plan).
    { dimension: "gift_timing", key: "prebuilt", content: { timing: "prebuilt" } },
    { dimension: "gift_timing", key: "on-click", content: { timing: "on-click" } },
    { dimension: "format", key: "html-ozzy", content: { format: "html" } },
    { dimension: "format", key: "plain", content: { format: "plain" } },
    { dimension: "ad_angle", key: "auto", content: { goal: "auto", awarenessMix: { problem_aware: 1 } } },
    { dimension: "ad_angle", key: "leads-problem", content: { goal: "leads", awarenessMix: { problem_aware: 1 } } },
    { dimension: "ad_angle", key: "leads-solution", content: { goal: "leads", awarenessMix: { solution_aware: 1 } } },
    { dimension: "ad_angle", key: "traffic-product", content: { goal: "traffic", awarenessMix: { product_aware: 1 } } },
  ];
  for (const n of NICHES) out.push({ dimension: "segment", key: n.niche, content: { niche: n.niche, cities: METROS, audience: n.audience, tier: n.tier } });
  return out;
}

const NICHE_RE = /^[a-z][a-z ]{1,29}$/;
const CITY_RE = /^[A-Za-z .'-]{2,40}, [A-Z]{2}$/;

/** Validate an arm's content for its dimension (seeds, strategist, manual). Returns an error or null. */
export function checkArmContent(dim: string, content: unknown): string | null {
  const c = (content ?? {}) as Record<string, unknown>;
  if (dim === "subject" || dim === "body" || dim === "followup") {
    if (c.timing !== undefined && c.timing !== "any" && !(GIFT_TIMINGS as readonly unknown[]).includes(c.timing)) return "bad timing";
    return typeof c.template === "string" ? checkVariant(dim as CopyDimension, c.template) : "template missing";
  }
  if (dim === "gift_timing") return (GIFT_TIMINGS as readonly unknown[]).includes(c.timing) ? null : "timing must be prebuilt|on-click";
  if (dim === "opener_style") return "opener_style is retired (AI openers read robotic)";
  if (dim === "format") return (EMAIL_FORMATS as readonly unknown[]).includes(c.format) ? null : "format must be html|plain";
  if (dim === "ad_angle") {
    if (!(AD_GOALS as readonly unknown[]).includes(c.goal)) return "bad goal";
    const mix = c.awarenessMix as Record<string, unknown> | undefined;
    if (!mix || typeof mix !== "object" || Object.keys(mix).length === 0) return "awarenessMix missing";
    for (const [k, v] of Object.entries(mix)) if (!(AWARENESS_LEVELS as readonly string[]).includes(k) || typeof v !== "number" || v <= 0) return "bad awarenessMix";
    return null;
  }
  if (dim === "segment") {
    // Niche-level: { niche, cities[], audience }. The old per-city shape ({ niche, city }) is retired in ensureSeeds.
    if (typeof c.niche !== "string" || !NICHE_RE.test(c.niche)) return "bad segment niche";
    if (!Array.isArray(c.cities) || c.cities.length === 0 || !c.cities.every((x) => typeof x === "string" && CITY_RE.test(x))) return "bad segment cities";
    return c.audience === undefined || c.audience === "local" || c.audience === "agency" ? null : "bad segment audience";
  }
  return "unknown dimension";
}

/** Add any missing seed arms (new seeds ship with code) and retire live arms whose content no longer passes the rules. */
export async function ensureSeeds(db: Db): Promise<number> {
  const existing = await db.klyArm.findMany({ select: { id: true, dimension: true, key: true, status: true, content: true } });
  const have = new Set(existing.map((a) => `${a.dimension}:${a.key}`));
  const rows = seedArms().filter((a) => !have.has(`${a.dimension}:${a.key}`) && !checkArmContent(a.dimension, a.content));
  const r = rows.length ? await db.klyArm.createMany({ data: rows.map((a) => ({ dimension: a.dimension, key: a.key, content: a.content as Prisma.InputJsonValue, origin: "seed" })), skipDuplicates: true }) : { count: 0 };
  if (r.count) await decide(db, "arm_new", existing.length ? `Added ${r.count} new starting variants: ${rows.map((a) => `${a.dimension}/${a.key}`).slice(0, 12).join(", ")}.` : `Seeded ${r.count} starting variants (copy, ad angles and ${SEED_NICHES.length} niches x ${SEED_CITIES.length} metros).`, { count: r.count });
  // Seed wording fixes ship with code: refresh seed arms whose stored content differs from the current seed.
  const seeds = new Map(seedArms().map((a) => [`${a.dimension}:${a.key}`, a.content]));
  for (const a of existing) {
    const want = seeds.get(`${a.dimension}:${a.key}`);
    if (want && a.status !== "retired" && JSON.stringify(want) !== JSON.stringify(a.content) && !checkArmContent(a.dimension, want)) {
      await db.klyArm.update({ where: { id: a.id }, data: { content: want as Prisma.InputJsonValue } });
      a.content = want as typeof a.content;
    }
  }
  const stale = existing.filter((a) => a.status !== "retired" && checkArmContent(a.dimension, a.content));
  if (stale.length) {
    await db.klyArm.updateMany({ where: { id: { in: stale.map((a) => a.id) } }, data: { status: "retired", retiredAt: new Date() } });
    await decide(db, "arm_retire", `Retired ${stale.length} variants that no longer meet the copy rules: ${stale.map((a) => `${a.dimension}/${a.key}`).slice(0, 12).join(", ")}.`, { ids: stale.map((a) => a.id) });
  }
  return r.count;
}

export type ArmRow = NonNullable<Awaited<ReturnType<Db["klyArm"]["findFirst"]>>>;

/** Copy arms carry content.audience ("agency"); unmarked arms are for local businesses. Other dimensions ignore it. */
export function armAudience(content: unknown): Audience {
  return (content as { audience?: unknown } | null)?.audience === "agency" ? "agency" : "local";
}

/** Which gift timing a copy arm fits. Unmarked (older or strategist-written) copy assumes the ad already exists. */
export function armTiming(content: unknown): GiftTiming | "any" {
  const t = (content as { timing?: unknown } | null)?.timing;
  return t === "any" || t === "on-click" ? t : "prebuilt";
}

export async function chooseArm(db: Db, dim: Dimension, rng: Rng, explorationPct: number, audience?: Audience, timing?: GiftTiming): Promise<ArmRow | null> {
  const all = await db.klyArm.findMany({ where: { dimension: dim, status: { not: "retired" } } });
  const isCopy = ["subject", "body", "followup"].includes(dim);
  // Timing is a hard rule (on-click copy must never claim the ad is already made); audience is a preference.
  const arms = isCopy && timing ? all.filter((a) => armTiming(a.content) === "any" || armTiming(a.content) === timing) : all;
  const fit = audience && isCopy ? arms.filter((a) => armAudience(a.content) === audience) : arms;
  return pickArm(fit.length ? fit : arms, rng, explorationPct);
}

/**
 * Recompute arm stats from lead outcomes (idempotent, crash-safe: no "already credited" bookkeeping).
 * A trial = a contacted lead (step >= 1; follow-up arms: step >= 2). Segments also count assigned leads.
 */
export async function refreshArmStats(db: Db): Promise<number> {
  const leads = await db.outboundLead.findMany({
    where: { NOT: { armIds: { isEmpty: true } } },
    select: { armIds: true, step: true, clickedAt: true, repliedAt: true, replyIntent: true, signedUpAt: true, paidAt: true, status: true, revenueCents: true, costMicros: true },
  });
  const arms = await db.klyArm.findMany({ select: { id: true, dimension: true } });
  const dimOf = new Map(arms.map((a) => [a.id, a.dimension]));
  type Acc = { assigned: number; sends: number; clicks: number; replies: number; positiveReplies: number; signups: number; paid: number; revenueCents: number; costMicros: bigint };
  const acc = new Map<string, Acc>(arms.map((a) => [a.id, { assigned: 0, sends: 0, clicks: 0, replies: 0, positiveReplies: 0, signups: 0, paid: 0, revenueCents: 0, costMicros: 0n }]));
  for (const l of leads) {
    for (const id of l.armIds) {
      const a = acc.get(id);
      if (!a) continue;
      a.assigned++;
      a.costMicros += l.costMicros;
      if (l.step < (dimOf.get(id) === "followup" ? 2 : 1)) continue;
      a.sends++;
      const paid = Boolean(l.paidAt) || l.status === "paid";
      const signed = paid || Boolean(l.signedUpAt) || l.status === "signed_up";
      if (l.clickedAt || l.status === "clicked") a.clicks++;
      if (l.repliedAt) a.replies++;
      if (l.replyIntent === "interested" || l.replyIntent === "question") a.positiveReplies++;
      if (signed) a.signups++;
      if (paid) a.paid++;
      a.revenueCents += l.revenueCents;
    }
  }
  for (const [id, a] of [...acc.entries()].sort(([x], [y]) => x.localeCompare(y))) await db.klyArm.update({ where: { id }, data: a });
  return acc.size;
}

/** Mark champions and retire clearly worse arms, per dimension; logs each change. */
export async function promoteAndRetire(db: Db, now: Date): Promise<void> {
  for (const dim of DIMENSIONS) {
    const arms = await db.klyArm.findMany({ where: { dimension: dim }, orderBy: { id: "asc" } });
    const v = judgeArms(arms);
    for (const id of v.retire) {
      const a = arms.find((x) => x.id === id);
      await db.klyArm.update({ where: { id }, data: { status: "retired", retiredAt: now } });
      await decide(db, "arm_retire", `Retired ${dim} variant "${a?.key}" after ${a?.sends} sends: clearly worse than the leader.`, { armId: id, dimension: dim, mean: a ? posteriorMean(a) : null });
    }
    if (!v.champion) continue;
    const cur = arms.find((a) => a.status === "champion");
    if (cur?.id === v.champion) continue;
    if (cur) await db.klyArm.update({ where: { id: cur.id }, data: { status: "active" } });
    const c = arms.find((a) => a.id === v.champion);
    await db.klyArm.update({ where: { id: v.champion }, data: { status: "champion" } });
    await decide(db, "champion", `New ${dim} champion: "${c?.key}" (${c?.sends} sends, ${c?.signups} signups, ${c?.paid} paid).`, { armId: v.champion, dimension: dim, previous: cur?.id ?? null });
  }
}

// Delivery economics (growth system `delivery_econ`, flag sys_delivery_econ, default OFF).
// Cost-to-deliver per pack / ad / video / Studio turn from the MEASURED cost fields (AdRun/Ad/AdJob.costMicros, written by the
// engine from engine/src/providers/cost.ts), against what a credit sells for (src/lib/ads/billing-config.ts). Pure TS.
// CONFIDENCE: costMicros is an equivalent at OpenAI API list prices; Codex calls are flat-rate so it is an upper bound on cash cost.
// It never changes models or prices: savings are PROPOSALS with explicit assumptions, decided by the owner.
import { ADS_PLANS, UNLOCK_PACK, AUTOPILOT_PRICE_CENTS, AD_DEPARTMENT_PRICE_CENTS } from "../ads/billing-config";
import { percentile } from "./reliability";

export const DELIVERY_EVENT = "delivery_econ";
export const STRIPE_FEE = { pct: 0.029, fixedCents: 30 };
export const stripeFeeCents = (priceCents: number) => Math.round(priceCents * STRIPE_FEE.pct + STRIPE_FEE.fixedCents);
const usd = (micros: number) => micros / 1_000_000;

export interface EconRun { id: string; kind: string; isTrial: boolean; status: string; costMicros: number; creditsCharged: number; readyStatics: number; readyMotion: number }
export interface EconAd { runId: string; kind: "static" | "motion"; template: string | null; status: string; costMicros: number }
export interface EconJob { type: string; status: string; attempts: number; costMicros: number }
export interface EconInput { now: Date; windowDays: number; runs: EconRun[]; ads: EconAd[]; jobs: EconJob[] }

export interface Stat { n: number; avg: number | null; p50: number | null; p90: number | null }
const stat = (v: number[]): Stat => ({ n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, p50: percentile(v, 50), p90: percentile(v, 90) });

export interface MarginRow { key: string; label: string; priceCents: number; credits: number; costUsdAllUsed: number | null; marginAllUsed: number | null; costUsdHalfUsed: number | null; marginHalfUsed: number | null }
export interface Hotspot { dim: "job_type" | "template"; key: string; costUsd: number; share: number; n: number }
export interface Proposal { id: string; title: string; assumption: string; monthlySavingUsd: number | null; confidence: "low" | "medium"; ownerDecision: string }
export interface DeliveryEcon {
  day: string; windowDays: number; confidence: "none" | "low" | "medium";
  costPerPackUsd: { paid: Stat; free: Stat; gift: Stat }; costPerAdUsd: Stat; costPerVideoUsd: Stat; costPerStudioTurnUsd: Stat; costPerCreditUsd: number | null;
  freePackAcquisitionCostUsd: number | null; margins: MarginRow[]; hotspots: Hotspot[]; retryCostShare: number | null; proposals: Proposal[];
}

/** Gross margin after Stripe fees if `credits * usedShare` are consumed at the measured $/credit. null when there is no cost data. */
export function planMargin(priceCents: number, credits: number, costPerCreditUsd: number | null, usedShare: number): { cost: number | null; margin: number | null } {
  if (costPerCreditUsd === null) return { cost: null, margin: null };
  const cost = credits * usedShare * costPerCreditUsd;
  const net = priceCents / 100 - stripeFeeCents(priceCents) / 100;
  return { cost, margin: net > 0 ? (net - cost) / (priceCents / 100) : null };
}

export function computeDeliveryEcon(input: EconInput, priceCentsOverride?: Record<string, number>): DeliveryEcon {
  const { runs, ads, jobs } = input;
  const finished = runs.filter((r) => ["completed", "partial"].includes(r.status) && r.costMicros > 0);
  const paid = finished.filter((r) => !r.isTrial && r.kind === "standard"), free = finished.filter((r) => r.isTrial && r.kind === "standard"), gift = finished.filter((r) => r.kind === "gift");
  const readyAds = ads.filter((a) => a.status === "ready" && a.costMicros > 0);
  const paidWithCredits = paid.filter((r) => r.creditsCharged > 0);
  const credits = paidWithCredits.reduce((a, r) => a + r.creditsCharged, 0);
  const costPerCredit = credits ? usd(paidWithCredits.reduce((a, r) => a + r.costMicros, 0)) / credits : null;

  const byTpl = new Map<string, { c: number; n: number }>(), byJob = new Map<string, { c: number; n: number }>();
  for (const a of ads) { const k = a.template ?? "unknown", e = byTpl.get(k) ?? { c: 0, n: 0 }; e.c += a.costMicros; e.n++; byTpl.set(k, e); }
  for (const j of jobs) { const e = byJob.get(j.type) ?? { c: 0, n: 0 }; e.c += j.costMicros; e.n++; byJob.set(j.type, e); }
  const hot = (dim: Hotspot["dim"], m: Map<string, { c: number; n: number }>): Hotspot[] => {
    const tot = [...m.values()].reduce((a, e) => a + e.c, 0);
    return [...m].map(([key, e]) => ({ dim, key, costUsd: usd(e.c), share: tot ? e.c / tot : 0, n: e.n })).filter((h) => h.costUsd > 0).sort((a, b) => b.costUsd - a.costUsd).slice(0, 6);
  };
  const jobTotal = jobs.reduce((a, j) => a + j.costMicros, 0);
  // Cost of retries: attempts beyond the first, assuming each attempt costs the same (the row stores the sum).
  const retryCost = jobs.reduce((a, j) => a + (j.attempts > 1 ? j.costMicros * (1 - 1 / j.attempts) : 0), 0);
  const retryShare = jobTotal ? retryCost / jobTotal : null;

  const planPrice = (key: string, dflt: number) => priceCentsOverride?.[key] ?? dflt;
  const margins: MarginRow[] = [];
  const add = (key: string, label: string, priceCents: number, cr: number) => {
    const all = planMargin(priceCents, cr, costPerCredit, 1), half = planMargin(priceCents, cr, costPerCredit, 0.5);
    margins.push({ key, label, priceCents, credits: cr, costUsdAllUsed: all.cost, marginAllUsed: all.margin, costUsdHalfUsed: half.cost, marginHalfUsed: half.margin });
  };
  add("unlock_pack", `$${UNLOCK_PACK.priceCents / 100} unlock`, planPrice("unlock_pack", UNLOCK_PACK.priceCents), UNLOCK_PACK.credits);
  const diy = ADS_PLANS.find((p) => p.key === "ad_department"), auto = ADS_PLANS.find((p) => p.key === "autopilot");
  if (diy) { add("first_month_97", "$97 first month (Ad Department)", 9700, diy.monthlyCredits); add("ad_department", `$${AD_DEPARTMENT_PRICE_CENTS / 100} Ad Department`, planPrice("ad_department", AD_DEPARTMENT_PRICE_CENTS), diy.monthlyCredits); }
  if (auto) add("autopilot", `$${AUTOPILOT_PRICE_CENTS / 100} Growth Autopilot`, planPrice("autopilot", AUTOPILOT_PRICE_CENTS), auto.monthlyCredits);
  for (const p of ADS_PLANS) if (!["ad_department", "autopilot"].includes(p.key) && p.priceCents > 0) add(p.key, `${p.name} plan`, p.priceCents, p.monthlyCredits);

  const packMonthly = paid.length ? (paid.length / Math.max(1, input.windowDays)) * 30 : 0;
  const paidAvg = stat(paid.map((r) => usd(r.costMicros))).avg ?? 0;
  const proposals: Proposal[] = [];
  if (retryShare !== null && retryShare > 0.05) proposals.push({ id: "fewer-retries", title: "Cut retries on the costliest failing stage", assumption: `Retries account for ${(retryShare * 100).toFixed(1)}% of measured job cost; assumes halving them.`, monthlySavingUsd: round2(usd(retryCost) * 0.5 * (30 / Math.max(1, input.windowDays))), confidence: "low", ownerDecision: "Approve lowering maxAttempts or fixing the root cause of the top failing stage." });
  const topJob = hot("job_type", byJob)[0];
  if (topJob && topJob.share > 0.4) proposals.push({ id: "cheaper-model-low-stakes", title: `Use a cheaper model for part of "${topJob.key}" (${(topJob.share * 100).toFixed(0)}% of job cost)`, assumption: "ASSUMPTION: 30% of that stage's cost can move to a cheaper model without a measurable quality drop; it needs an A/B quality check before adoption.", monthlySavingUsd: round2(topJob.costUsd * 0.3 * (30 / Math.max(1, input.windowDays))), confidence: "low", ownerDecision: "Owner decides model changes; this system never switches models." });
  if (packMonthly > 0) proposals.push({ id: "reuse-extraction-cache", title: "Cache site extraction / brand reads for repeat URLs", assumption: "ASSUMPTION: 10% of paid packs re-run a site already extracted in the last 30 days and extraction is ~5% of pack cost; savings are small unless repeat rate is higher.", monthlySavingUsd: round2(packMonthly * paidAvg * 0.1 * 0.05), confidence: "low", ownerDecision: "Engineering call; low priority unless margin is the constraint." });
  const worstMargin = margins.filter((m) => m.marginAllUsed !== null).sort((a, b) => (a.marginAllUsed ?? 1) - (b.marginAllUsed ?? 1))[0];
  if (worstMargin && (worstMargin.marginAllUsed ?? 1) < 0.5) proposals.push({ id: `margin-${worstMargin.key}`, title: `"${worstMargin.label}" margin is ${(100 * (worstMargin.marginAllUsed ?? 0)).toFixed(0)}% if every credit is used`, assumption: "Measured $/credit x all credits used (worst case). Real usage is usually lower.", monthlySavingUsd: null, confidence: "medium", ownerDecision: "Owner decision: leave, cap usage, or re-price. Prices are never changed automatically." });

  const samples = paid.length + free.length;
  return {
    day: input.now.toISOString().slice(0, 10), windowDays: input.windowDays, confidence: samples === 0 ? "none" : samples < 30 ? "low" : "medium",
    costPerPackUsd: { paid: stat(paid.map((r) => usd(r.costMicros))), free: stat(free.map((r) => usd(r.costMicros))), gift: stat(gift.map((r) => usd(r.costMicros))) },
    costPerAdUsd: stat(readyAds.filter((a) => a.kind === "static").map((a) => usd(a.costMicros))), costPerVideoUsd: stat(readyAds.filter((a) => a.kind === "motion").map((a) => usd(a.costMicros))),
    costPerStudioTurnUsd: stat(jobs.filter((j) => j.type === "studio_turn" && j.status === "succeeded" && j.costMicros > 0).map((j) => usd(j.costMicros))),
    costPerCreditUsd: costPerCredit, freePackAcquisitionCostUsd: stat(free.map((r) => usd(r.costMicros))).avg, margins,
    hotspots: [...hot("job_type", byJob), ...hot("template", byTpl)], retryCostShare: retryShare, proposals,
  };
}
const round2 = (x: number) => Math.round(x * 100) / 100;

type Rows = Array<Record<string, unknown>>;
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface EconDb {
  adRun: { findMany(a: any): Promise<Rows> };
  ad: { findMany(a: any): Promise<Rows> };
  adJob: { findMany(a: any): Promise<Rows> };
}
const nn = (v: unknown) => (typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export async function loadEconInput(db: EconDb, now: Date, windowDays = 30): Promise<EconInput> {
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const [runs, ads, jobs] = await Promise.all([
    db.adRun.findMany({ where: { createdAt: { gte: since } }, take: 5000, select: { id: true, kind: true, isTrial: true, status: true, costMicros: true, creditsCharged: true } }),
    db.ad.findMany({ where: { createdAt: { gte: since } }, take: 60000, select: { runId: true, kind: true, status: true, costMicros: true, visualBrief: true } }),
    db.adJob.findMany({ where: { createdAt: { gte: since } }, take: 30000, select: { type: true, status: true, attempts: true, costMicros: true } }),
  ]);
  const ready = new Map<string, { s: number; m: number }>();
  for (const a of ads) if (a.status === "ready") { const e = ready.get(String(a.runId)) ?? { s: 0, m: 0 }; if (a.kind === "motion") e.m++; else e.s++; ready.set(String(a.runId), e); }
  return {
    now, windowDays,
    runs: runs.map((r) => ({ id: String(r.id), kind: String(r.kind), isTrial: Boolean(r.isTrial), status: String(r.status), costMicros: nn(r.costMicros), creditsCharged: nn(r.creditsCharged), readyStatics: ready.get(String(r.id))?.s ?? 0, readyMotion: ready.get(String(r.id))?.m ?? 0 })),
    ads: ads.map((a) => ({ runId: String(a.runId), kind: a.kind === "motion" ? "motion" : "static", status: String(a.status), costMicros: nn(a.costMicros), template: typeof obj(obj(a.visualBrief).render).template === "string" ? (obj(obj(a.visualBrief).render).template as string) : null })),
    jobs: jobs.map((j) => ({ type: String(j.type), status: String(j.status), attempts: nn(j.attempts), costMicros: nn(j.costMicros) })),
  };
}

// Business-wide coordination: shared constraint -> priority weights, resource contention, AI-budget throttling,
// conflicting experiments. Pure. Output is PROPOSALS (written to the ops page / ops_decision log); nothing here switches flags.
import type { LedgerRow } from "./ledger";

export type ConstraintKey = "traffic" | "activation" | "first_purchase" | "upsell" | "delivery" | "retention" | "economics";

/** Which ledger areas serve which constraint (acquire = traffic, convert = first_purchase/upsell, keep = activation/delivery/retention). */
const CONSTRAINT_AREAS: Record<ConstraintKey, string[]> = {
  traffic: ["acquire"], activation: ["keep", "delivery"], first_purchase: ["convert"], upsell: ["convert"], delivery: ["delivery", "reliability", "qa"], retention: ["keep"], economics: ["intelligence", "delivery"],
};

/** 3 = revenue-critical (never throttled first), 2 = serves this week's constraint, 1 = everything else. */
export function priorityWeights(rows: readonly LedgerRow[], constraint: ConstraintKey | null): Record<string, 1 | 2 | 3> {
  const areas = constraint ? CONSTRAINT_AREAS[constraint] : [];
  const out: Record<string, 1 | 2 | 3> = {};
  for (const r of rows) out[r.id] = r.revenueCritical ? 3 : areas.includes(r.area) ? 2 : 1;
  return out;
}

export interface ContentionInput { queueDepth: number; runningJobs: number; avgPackSeconds: number | null; reelsRendering: boolean; packConcurrency: number }
export interface Proposal { id: string; severity: "high" | "medium" | "low"; message: string; action: string }

/** Reels (ffmpeg) must not starve paying customers' packs. */
export function detectContention(i: ContentionInput): Proposal[] {
  const out: Proposal[] = [];
  const wait = i.avgPackSeconds && i.packConcurrency > 0 ? Math.round((i.queueDepth * i.avgPackSeconds) / i.packConcurrency / 60) : null;
  if (i.queueDepth > i.packConcurrency * 3 && i.reelsRendering) out.push({ id: "contention:reels-vs-packs", severity: "high", message: `${i.queueDepth} jobs queued${wait !== null ? ` (~${wait} min wait)` : ""} while reels are rendering.`, action: "Pause sys_reels until the queue drains; customer packs first." });
  else if (wait !== null && wait > 60) out.push({ id: "contention:queue-wait", severity: "medium", message: `Queue wait is about ${wait} minutes.`, action: "Check engine concurrency before adding any new generation load." });
  return out;
}

/** AI call budget: if total exceeds the weekly budget, propose throttling lowest-priority (non-revenue) systems first. */
export function aiBudgetThrottle(callsBySystem: Record<string, number>, weekly: number, weights: Record<string, number>): Proposal[] {
  const total = Object.values(callsBySystem).reduce((a, b) => a + b, 0);
  if (total <= weekly) return [];
  const order = Object.entries(callsBySystem).filter(([, n]) => n > 0).sort((a, b) => (weights[`system:${a[0]}`] ?? 1) - (weights[`system:${b[0]}`] ?? 1) || b[1] - a[1]);
  const out: Proposal[] = [];
  let over = total - weekly;
  for (const [k, n] of order) {
    if (over <= 0 || (weights[`system:${k}`] ?? 1) >= 3) break;
    out.push({ id: `budget:${k}`, severity: "medium", message: `AI calls ${total}/${weekly} this week; ${k} used ${n}.`, action: `Throttle ${k} first (flag sys_${k}); revenue-critical systems keep their budget.` });
    over -= n;
  }
  return out;
}

export interface ActiveExperiment { key: string; surface: string; kind: "copy" | "offer" | "money_model" | "price" | "other" }

/** Two experiments on one surface collide; offer experiments collide with money-model/price changes. */
export function conflictingExperiments(exps: readonly ActiveExperiment[]): Proposal[] {
  const out: Proposal[] = [];
  for (let a = 0; a < exps.length; a++) for (let b = a + 1; b < exps.length; b++) {
    const x = exps[a], y = exps[b];
    if (!x || !y) continue;
    const same = x.surface.toLowerCase() === y.surface.toLowerCase();
    const offerVsModel = (x.kind === "offer" && (y.kind === "money_model" || y.kind === "price")) || (y.kind === "offer" && (x.kind === "money_model" || x.kind === "price"));
    if (same || offerVsModel) out.push({ id: `experiments:${x.key}+${y.key}`, severity: "medium", message: `${x.key} and ${y.key} ${same ? `both change ${x.surface}` : "change the offer and the money model at once"}; results can't be separated.`, action: "Pause one until the other concludes (one constraint at a time)." });
  }
  return out;
}

export function sharedConstraintLine(c: { key: string; label: string; evidence: string } | null): string {
  return c ? `This week's one constraint: ${c.label}. ${c.evidence}` : "No constraint identified yet (not enough data).";
}

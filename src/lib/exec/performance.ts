// Strategic performance management (pure). Separates OPERATIONAL success (it ran, it shipped) from COMMERCIAL success
// (moved the target metric, with evidence). Honest small-sample handling: below the minimum sample nothing is called a win or a loss.
import type { ExecStage } from "./validation-mode";

export type Verdict = "commercial_win" | "operational_only" | "consuming_without_value" | "inconclusive" | "in_progress" | "commercial_miss";
export type Recommendation = "continue" | "modify" | "expand" | "stop";

export interface PerfInput {
  id: string; title: string; kind: "objective" | "system";
  /** Did it run / ship (dispatches ok, heartbeat ok, shipped artefact). */
  operational: { ran: boolean; shipped: boolean; failures: number };
  /** Target metric movement. `n` = observations behind `current` (e.g. exposures, sign-ups). */
  commercial: { metric: string; baseline: number | null; current: number | null; target: number | null; n: number; minN: number; successes?: number; unit?: "rate" | "count" } | null;
  /** Resource use in the window. */
  cost: { aiCalls: number; costCents: number; ownerMinutes?: number };
  ageDays: number;
  /** Days after which an initiative should have shown commercial movement. */
  expectedDays?: number;
}
export interface PerfResult {
  id: string; title: string; kind: PerfInput["kind"]; verdict: Verdict; recommendation: Recommendation;
  operationalOk: boolean; commercialOk: boolean | null; evidence: string; confidence: "low" | "medium" | "high"; flags: string[];
}

const fmt = (x: number | null, unit: "rate" | "count" = "rate") => (x === null ? "n/a" : unit === "count" ? String(Math.round(x * 100) / 100) : `${(Math.round(x * 1000) / 10).toFixed(1)}%`);

export function evaluate(i: PerfInput, stage: ExecStage): PerfResult {
  const opOk = i.operational.ran && i.operational.failures === 0;
  const c = i.commercial;
  const flags: string[] = [];
  const out = (verdict: Verdict, recommendation: Recommendation, commercialOk: boolean | null, evidence: string, confidence: PerfResult["confidence"]): PerfResult => {
    // Never recommend expansion before there are paying customers / a repeatable funnel.
    let rec = recommendation;
    if (rec === "expand" && (stage === "pre_revenue" || stage === "first_customers")) { rec = "continue"; flags.push("expansion held: stage is too early"); }
    return { id: i.id, title: i.title, kind: i.kind, verdict, recommendation: rec, operationalOk: opOk, commercialOk, evidence, confidence, flags };
  };
  const late = i.ageDays >= (i.expectedDays ?? 28);
  if (!c) {
    if (i.cost.aiCalls > 0 || i.cost.costCents > 0) {
      if (late && opOk) { flags.push("consuming resources without a measurable target"); return out("consuming_without_value", "modify", false, `Ran for ${i.ageDays}d using ${i.cost.aiCalls} AI calls / ${i.cost.costCents}c with no commercial metric attached.`, "medium"); }
    }
    return out(opOk ? "operational_only" : "in_progress", opOk ? "modify" : "continue", null, opOk ? "It ran, but no commercial metric is attached, so its value is unknown." : "Not running cleanly yet.", "low");
  }
  const pct = (x: number | null) => fmt(x, c.unit);
  const small = c.n < c.minN;
  if (small) {
    flags.push(`small sample (${c.n}/${c.minN})`);
    if (late && opOk && (i.cost.aiCalls > 0 || i.cost.costCents > 0)) { flags.push("old and still no readable evidence"); return out("inconclusive", "modify", null, `Only ${c.n} observations after ${i.ageDays}d (need ${c.minN}); the design may not produce evidence at this traffic.`, "low"); }
    return out(i.ageDays < (i.expectedDays ?? 28) ? "in_progress" : "inconclusive", "continue", null, `${c.metric}: ${pct(c.current)} from ${c.n} observations; below the ${c.minN} needed to read it.`, "low");
  }
  const moved = c.current !== null && c.baseline !== null && c.current > c.baseline;
  const hit = c.target !== null && c.current !== null && c.current >= c.target;
  if (hit) return out("commercial_win", "expand", true, `${c.metric} reached ${pct(c.current)} (target ${pct(c.target)}, baseline ${pct(c.baseline)}, n=${c.n}).`, c.n >= c.minN * 3 ? "high" : "medium");
  if (moved) return out("in_progress", "continue", null, `${c.metric} moved ${pct(c.baseline)} -> ${pct(c.current)} (n=${c.n}); target ${pct(c.target)} not reached.`, "medium");
  if (opOk && i.operational.shipped) { flags.push("technically complete but commercially ineffective"); return out("operational_only", late ? "stop" : "modify", false, `Shipped and running, but ${c.metric} did not move (${pct(c.baseline)} -> ${pct(c.current)}, n=${c.n}).`, "medium"); }
  return out("commercial_miss", "modify", false, `${c.metric} ${pct(c.current)} vs baseline ${pct(c.baseline)} (n=${c.n}); not running cleanly.`, "medium");
}

const RANK: Record<Recommendation, number> = { stop: 0, modify: 1, continue: 2, expand: 3 };
export interface RankedInitiative extends PerfResult { rank: number }

/** Ranked list: stop/modify first (they free resources and need a decision), then continue, then expand. Stable by id. */
export function rankInitiatives(results: readonly PerfResult[]): RankedInitiative[] {
  return [...results].sort((a, b) => RANK[a.recommendation] - RANK[b.recommendation] || (a.commercialOk === false ? -1 : 0) - (b.commercialOk === false ? -1 : 0) || a.id.localeCompare(b.id)).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** System row (from the accountability ledger) joined with its cost and attributed outcomes. */
export interface SystemPerfFacts { id: string; label: string; status: string; ageDays: number; outputs30d: number | null; aiCalls7d: number; costMicros30d: number; attributedOutcomes30d: number; revenueCritical: boolean }
export function evaluateSystem(f: SystemPerfFacts, stage: ExecStage): PerfResult {
  const ran = f.status === "operational" || f.status === "idle_by_design";
  return evaluate({
    id: f.id, title: f.label, kind: "system", operational: { ran, shipped: (f.outputs30d ?? 0) > 0, failures: f.status === "failing" ? 1 : 0 },
    commercial: f.attributedOutcomes30d > 0 || f.revenueCritical ? { metric: "attributed outcomes (30d)", baseline: 0, current: f.attributedOutcomes30d, target: 1, n: Math.max(f.outputs30d ?? 0, f.attributedOutcomes30d), minN: 5 } : null,
    cost: { aiCalls: f.aiCalls7d, costCents: Math.round(f.costMicros30d / 10_000) }, ageDays: f.ageDays, expectedDays: 28,
  }, stage);
}

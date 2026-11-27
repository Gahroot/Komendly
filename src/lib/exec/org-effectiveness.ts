// Organisational effectiveness (pure). Evaluates the autonomous organisation itself and PROPOSES consolidation/removal.
// It never removes, switches or edits anything, and it cannot touch governance/authority: every output is advice with autoApply:false.
import { type ExecStage, policyFor } from "./validation-mode";

export interface OrgSystem { id: string; label: string; area: string; status: string; flagOn: boolean | null; outputs30d: number | null; aiCalls7d: number; costCents30d: number; revenueCritical: boolean; attributedOutcomes30d: number }
export interface OrgFacts { systems: OrgSystem[]; decisionLatencyDays: number[]; ownerInterventionsByWeek: number[]; ownerDecisionsOpen: number }
export interface OrgFinding { kind: "duplicate" | "idle" | "silent" | "high_cost_low_value" | "latency" | "owner_load"; ids: string[]; message: string; proposal: string; autoApply: false }

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 4));
const jaccard = (a: Set<string>, b: Set<string>) => { let i = 0; for (const w of a) if (b.has(w)) i++; return a.size + b.size - i ? i / (a.size + b.size - i) : 0; };
const median = (n: number[]) => { if (!n.length) return null; const s = [...n].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? null; };

export function evaluateOrganisation(f: OrgFacts): { findings: OrgFinding[]; ownerInterventionsPerWeek: number | null; medianDecisionLatencyDays: number | null } {
  const out: OrgFinding[] = [];
  const on = f.systems.filter((s) => s.flagOn !== false);
  for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
    const a = on[i]!, b = on[j]!;
    if (a.area === b.area && jaccard(words(a.label), words(b.label)) >= 0.5) out.push({ kind: "duplicate", ids: [a.id, b.id], message: `${a.label} and ${b.label} look duplicative.`, proposal: "Consider consolidating into one (owner decides); nothing is removed automatically.", autoApply: false });
  }
  for (const s of f.systems) {
    if (s.flagOn && s.status === "silent") out.push({ kind: "silent", ids: [s.id], message: `${s.label} is enabled but has never produced evidence it ran.`, proposal: "Verify it runs or switch it off.", autoApply: false });
    if (s.flagOn && s.status === "idle_by_design" && !s.revenueCritical && s.outputs30d === 0) out.push({ kind: "idle", ids: [s.id], message: `${s.label} is on but idle (no triggers in 30 days).`, proposal: "Keep if the trigger is expected; else candidate to retire.", autoApply: false });
    if (s.flagOn && !s.revenueCritical && s.attributedOutcomes30d === 0 && (s.costCents30d >= 100 || s.aiCalls7d >= 20)) out.push({ kind: "high_cost_low_value", ids: [s.id], message: `${s.label} used ${s.aiCalls7d} AI calls/week (${s.costCents30d}c/30d) with no attributed outcome.`, proposal: "Reduce its cadence or retire it; re-check after 4 weeks of evidence.", autoApply: false });
  }
  const med = median(f.decisionLatencyDays);
  if (med !== null && med > 7) out.push({ kind: "latency", ids: [], message: `Median owner-decision latency is ${med} days.`, proposal: "Batch decisions in the weekly brief; give each a recommended default.", autoApply: false });
  const per = f.ownerInterventionsByWeek.length ? Math.round((f.ownerInterventionsByWeek.reduce((a, b) => a + b, 0) / f.ownerInterventionsByWeek.length) * 10) / 10 : null;
  if (per !== null && per > 3) out.push({ kind: "owner_load", ids: [], message: `The owner stepped in by hand ${per} times a week on average.`, proposal: "Permanently fix the repeated interventions (see the weekly process review).", autoApply: false });
  return { findings: out, ownerInterventionsPerWeek: per, medianDecisionLatencyDays: med };
}

// ---------- "no new system unless justified" ----------
export interface SystemProposal {
  name: string; problem: string; evidenceOfProblem: string; constraintServed: string;
  existingConsidered: Array<{ id: string; whyNotEnough: string }>; killCriteria: string; owner: string; measurableOutcome: string;
  costEstimate: { aiCallsPerWeek: number; cents: number }; unblocksEvidence?: boolean;
}
export interface Justification { ok: boolean; reasons: string[] }

export function justifyNewSystem(p: Partial<SystemProposal>, stage: ExecStage = "pre_revenue"): Justification {
  const why: string[] = [];
  const has = (v: unknown, min = 12) => typeof v === "string" && v.trim().length >= min;
  if (!has(p.problem)) why.push("state the specific problem");
  if (!has(p.evidenceOfProblem)) why.push("provide evidence the problem is real (data, not opinion)");
  if (!has(p.constraintServed, 3)) why.push("name the current business constraint it serves");
  if (!p.existingConsidered?.length || p.existingConsidered.some((e) => !has(e.whyNotEnough))) why.push("list existing capabilities considered and why each is not enough");
  if (!has(p.killCriteria)) why.push("define kill criteria (when it is removed)");
  if (!has(p.owner, 3)) why.push("name its accountable owner/system");
  if (!has(p.measurableOutcome)) why.push("define a measurable commercial outcome");
  if (!p.costEstimate) why.push("estimate AI calls and cost");
  if (policyFor(stage).blockedKinds.includes("new_system") && !p.unblocksEvidence) why.push(`blocked in ${policyFor(stage).mode}: only systems that unblock evidence gathering are allowed`);
  return { ok: why.length === 0, reasons: why };
}

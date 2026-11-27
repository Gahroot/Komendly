// Decision intelligence: exec_decision record, authority classification, outcome review and the executive learning loop. Pure TS.
import { FNV, asObj, type EvidenceItem, type Reversibility } from "./types";

export type Boundary = "financial" | "pricing_contract" | "product_change" | "partnership" | "data_sensitivity" | "production_risk" | "access" | "autonomy_expansion" | "legal" | "billing_config" | "spend_cap";
export const BOUNDARIES: readonly Boundary[] = ["financial", "pricing_contract", "product_change", "partnership", "data_sensitivity", "production_risk", "access", "autonomy_expansion", "legal", "billing_config", "spend_cap"];
export type AuthorityLevel = "auto" | "owner_required" | "forbidden";

export interface Expected { metric: string; comparator: ">=" | "<=" | "="; target: number; windowDays: number }
export interface ExecDecision {
  id: string; question: string; alternatives: Array<{ option: string; pros: string[]; cons: string[] }>; chosen: string; reasoning: string;
  evidence: EvidenceItem[]; uncertainty: string; reversibility: Reversibility; expected: Expected | null; expectedOutcome: string;
  assumptions: string[]; reviewDate: string; boundaries: Boundary[]; spendCents: number; objectiveId?: string; authority?: AuthorityLevel;
}
export interface AuthorityVerdict { level: AuthorityLevel; reasons: string[] }

/** Boundaries and reversibility decide who may act. Autonomy expansion is ALWAYS owner. Billing prices, caps and legal are forbidden for agents (recommend only). */
export function decideAuthority(d: Pick<ExecDecision, "boundaries" | "reversibility" | "spendCents">): AuthorityVerdict {
  const reasons: string[] = [];
  const b = new Set(d.boundaries);
  if (b.has("legal") || b.has("billing_config") || b.has("spend_cap")) return { level: "forbidden", reasons: ["executive agents may never change legal text, billing configuration or spend caps (recommend to owner only)"] };
  if (b.has("autonomy_expansion")) reasons.push("expanding autonomy is always an owner decision");
  for (const [k, why] of [["financial", "financial commitment"], ["pricing_contract", "pricing or contract change"], ["product_change", "product change"], ["partnership", "partnership"], ["data_sensitivity", "data-sensitivity change"], ["access", "access or credential change"]] as const) if (b.has(k)) reasons.push(`${why} needs the owner`);
  if (b.has("production_risk")) reasons.push("production risk needs the owner");
  if (d.spendCents > 0) reasons.push("any spend needs the owner");
  if (d.reversibility === "irreversible") reasons.push("irreversible actions need the owner");
  if (d.reversibility === "costly" && !reasons.length) reasons.push("costly-to-reverse actions need the owner");
  return reasons.length ? { level: "owner_required", reasons } : { level: "auto", reasons: ["reversible, zero-spend, inside no protected boundary"] };
}

export function decisionId(question: string, at: string): string { return `dec-${FNV(`${question.toLowerCase().trim()}|${at.slice(0, 10)}`).slice(0, 10)}`; }
export function validateDecision(d: ExecDecision): string[] {
  const r: string[] = [];
  if (!d.question.trim()) r.push("no question");
  if (d.alternatives.length < 2) r.push("fewer than 2 alternatives considered");
  if (!d.alternatives.some((a) => a.option === d.chosen)) r.push("chosen option is not one of the alternatives");
  if (!d.evidence.length) r.push("no evidence");
  if (!d.uncertainty.trim()) r.push("uncertainty not stated");
  if (!Number.isFinite(Date.parse(d.reviewDate))) r.push("no valid review date");
  return r;
}

// ---------- outcome review ----------
export interface Actual { value: number | null; n: number; evidence: EvidenceItem[]; assumptionsHeld?: boolean[] }
export type Verdict = "met" | "partly_met" | "missed" | "inconclusive";
export interface DecisionReview { decisionId: string; reviewedAt: string; verdict: Verdict; expectedVsActual: string; evidence: EvidenceItem[]; assumptionsHeld: number; assumptionsTested: number; lessons: string[]; errorTags: string[] }
const MIN_REVIEW_N = 5;

export const isReviewDue = (d: Pick<ExecDecision, "reviewDate">, now: Date) => Date.parse(d.reviewDate) <= now.getTime();

export function reviewDecision(d: ExecDecision, actual: Actual | null, now: Date): DecisionReview {
  const base = { decisionId: d.id, reviewedAt: now.toISOString(), evidence: actual?.evidence ?? [] };
  const held = (actual?.assumptionsHeld ?? []).filter(Boolean).length, tested = actual?.assumptionsHeld?.length ?? 0;
  if (!d.expected || !actual || actual.value === null || actual.n < MIN_REVIEW_N) {
    return { ...base, verdict: "inconclusive", expectedVsActual: `expected ${d.expectedOutcome}; ${actual && actual.value !== null ? `only ${actual.n} observations (need ${MIN_REVIEW_N}+)` : "no measurement available"}`, assumptionsHeld: held, assumptionsTested: tested, lessons: ["Decision could not be judged: measure the expected metric before deciding, or choose a metric that exists."], errorTags: ["unmeasurable_expectation"] };
  }
  const e = d.expected, v = actual.value;
  const ok = e.comparator === ">=" ? v >= e.target : e.comparator === "<=" ? v <= e.target : v === e.target;
  const close = e.target !== 0 && Math.abs(v - e.target) / Math.abs(e.target) <= 0.25;
  const verdict: Verdict = ok ? "met" : close ? "partly_met" : "missed";
  const tags: string[] = [], lessons: string[] = [];
  if (verdict === "missed") { tags.push("outcome_missed"); lessons.push(`Expected ${e.metric} ${e.comparator} ${e.target}, observed ${v} (n=${actual.n}).`); }
  if (tested && held < tested) { tags.push("assumption_failed"); lessons.push(`${tested - held} of ${tested} assumptions did not hold.`); }
  if (d.evidence.every((x) => x.level === "assumed") && verdict !== "met") { tags.push("decided_on_assumed_evidence"); lessons.push("The decision rested on assumed evidence only; require inferred or measured next time."); }
  if (verdict === "met" && !lessons.length) lessons.push("Expectation met; keep the method.");
  return { ...base, verdict, expectedVsActual: `expected ${e.metric} ${e.comparator} ${e.target} within ${e.windowDays}d; observed ${v} (n=${actual.n})`, assumptionsHeld: held, assumptionsTested: tested, lessons, errorTags: tags };
}

export interface QualityStats { reviewed: number; judged: number; met: number; partly: number; missed: number; inconclusive: number; assumptionsHeldRate: number | null; recurringErrors: Array<{ tag: string; count: number }> }
export function decisionQuality(reviews: readonly DecisionReview[]): QualityStats {
  const c = { met: 0, partly: 0, missed: 0, inconclusive: 0 };
  let held = 0, tested = 0; const tags = new Map<string, number>();
  for (const r of reviews) {
    if (r.verdict === "met") c.met++; else if (r.verdict === "partly_met") c.partly++; else if (r.verdict === "missed") c.missed++; else c.inconclusive++;
    held += r.assumptionsHeld; tested += r.assumptionsTested;
    for (const t of r.errorTags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  return { reviewed: reviews.length, judged: c.met + c.partly + c.missed, ...c, assumptionsHeldRate: tested ? held / tested : null, recurringErrors: [...tags].filter(([, n]) => n >= 2).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count) };
}
export const parseDecision = (p: unknown): ExecDecision | null => { const o = asObj(p); return o.id && o.question && Array.isArray(o.alternatives) ? (o as unknown as ExecDecision) : null; };

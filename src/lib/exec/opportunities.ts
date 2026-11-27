// Opportunity discovery (pure parts). A weekly Codex pass proposes AT MOST 3 opportunities from real evidence; this module builds the
// strict-JSON prompt, validates the output, scores through the allocator, filters by stage and parks anything behind a bigger constraint.
import { stageIndexOf } from "./validation-mode";
import { type Candidate, scoreCandidate, type Scored } from "./allocation";
import { allowedStrategies, STRATEGIES } from "./stage";
import { type ExecStage } from "./validation-mode";

export type OppKind = "segment" | "partnership" | "offer" | "distribution" | "underserved_problem";
export interface Opportunity { title: string; kind: OppKind; strategy: string; evidence: string[]; why_now: string; first_step: string; impact: { lo: number; mid: number; hi: number }; confidence: number; cost: number; time_weeks: number; risk: number }
export interface JudgedOpportunity { opp: Opportunity; score: Scored; status: "candidate" | "parked" | "dropped"; reason: string; label: string }

export const MAX_OPPORTUNITIES = 3;
/** Strategies permitted per stage: the strategy engine's allowedStrategies(stageIndex) (src/lib/exec/stage.ts) is the single source. */
export { stageIndexOf };
export const allowedStrategiesFor = (s: ExecStage): string[] => [...allowedStrategies(stageIndexOf(s))];

export const OPPORTUNITY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["opportunities"],
  properties: { opportunities: { type: "array", maxItems: MAX_OPPORTUNITIES, items: { type: "object", additionalProperties: false,
    required: ["title", "kind", "strategy", "evidence", "why_now", "first_step", "impact", "confidence", "cost", "time_weeks", "risk"],
    properties: {
      title: { type: "string" }, kind: { type: "string", enum: ["segment", "partnership", "offer", "distribution", "underserved_problem"] }, strategy: { type: "string", enum: [...STRATEGIES] },
      evidence: { type: "array", items: { type: "string" }, minItems: 1 }, why_now: { type: "string" }, first_step: { type: "string" },
      impact: { type: "object", additionalProperties: false, required: ["lo", "mid", "hi"], properties: { lo: { type: "number" }, mid: { type: "number" }, hi: { type: "number" } } },
      confidence: { type: "number" }, cost: { type: "number" }, time_weeks: { type: "number" }, risk: { type: "number" },
    } } } },
} as const;

export const OPPORTUNITY_SYSTEM = "You are the opportunity scout for a PRE-REVENUE company. Propose at most 3 opportunities, each grounded in the evidence given (cite it). Never invent numbers or customers. Prefer cheap experiments on existing channels. If the evidence supports nothing, return an empty list. Output strict JSON only.";

export function buildOpportunityPrompt(e: { stage: ExecStage; constraint: string | null; objections: string[]; replies: string[]; competitors: string[]; channelResults: string[]; segments: string[]; allowedStrategies: string[] }): string {
  const sec = (t: string, a: string[]) => `${t}:\n${a.length ? a.slice(0, 12).map((x) => `- ${x.slice(0, 240)}`).join("\n") : "- (no data)"}`;
  return [`Stage: ${e.stage}. Current constraint: ${e.constraint ?? "unknown"}.`, `Allowed strategies: ${e.allowedStrategies.join(", ")}. Anything outside this list will be dropped.`,
    sec("Objection map", e.objections), sec("Customer/prospect replies", e.replies), sec("Competitor data", e.competitors), sec("Channel results", e.channelResults), sec("Segments in the organic registry", e.segments)].join("\n\n");
}

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
export function parseOpportunities(raw: unknown): Opportunity[] {
  let j: unknown = raw;
  if (typeof raw === "string") { try { j = JSON.parse(raw); } catch { return []; } }
  const list = (j as { opportunities?: unknown })?.opportunities;
  if (!Array.isArray(list)) return [];
  const out: Opportunity[] = [];
  for (const o of list as Array<Record<string, unknown>>) {
    if (typeof o?.title !== "string" || typeof o.strategy !== "string" || !Array.isArray(o.evidence) || o.evidence.length === 0 || o.evidence.some((x) => typeof x !== "string")) continue; // no evidence = no opportunity
    const im = (o.impact ?? {}) as Record<string, unknown>;
    const lo = num(im.lo, 0, 10, 0), mid = Math.max(lo, num(im.mid, 0, 10, 1)), hi = Math.max(mid, num(im.hi, 0, 10, 2));
    out.push({ title: o.title.slice(0, 120), kind: (["segment", "partnership", "offer", "distribution", "underserved_problem"].includes(String(o.kind)) ? o.kind : "segment") as OppKind, strategy: o.strategy, evidence: (o.evidence as string[]).slice(0, 5), why_now: String(o.why_now ?? "").slice(0, 300), first_step: String(o.first_step ?? "").slice(0, 300), impact: { lo, mid, hi }, confidence: num(o.confidence, 0, 1, 0.3), cost: num(o.cost, 0, 1000, 1), time_weeks: num(o.time_weeks, 1, 52, 4), risk: num(o.risk, 0, 1, 0.2) });
    if (out.length >= MAX_OPPORTUNITIES) break;
  }
  return out;
}

export function judgeOpportunities(list: readonly Opportunity[], o: { stage: ExecStage; allowed?: (s: ExecStage) => string[]; constraintIsBigger: boolean; constraint: string | null }): JudgedOpportunity[] {
  const allowed = (o.allowed ?? allowedStrategiesFor)(o.stage);
  return list.slice(0, MAX_OPPORTUNITIES).map((opp) => {
    const cand: Candidate = { id: opp.title, label: opp.title, resource: "owner_attention", tag: "validation", impact: opp.impact, confidence: opp.confidence, cost: opp.cost, timeWeeks: opp.time_weeks, reversible: true, risk: opp.risk };
    const score = scoreCandidate(cand, o.stage);
    if (!allowed.includes(opp.strategy)) return { opp, score, status: "dropped" as const, reason: `strategy "${opp.strategy}" is premature at ${o.stage}`, label: "dropped: premature" };
    if (o.constraintIsBigger) return { opp, score, status: "parked" as const, reason: `a bigger existing constraint (${o.constraint ?? "current constraint"}) comes first`, label: `parked: bigger constraint (${o.constraint ?? "current"}) first` };
    return { opp, score, status: "candidate" as const, reason: "fits the current stage", label: "candidate" };
  });
}

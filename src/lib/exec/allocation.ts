// Capital & resource allocation (pure). Scores candidate uses of limited resources and produces a weekly plan.
// NEVER moves money or raises caps: every plan has spendCents 0 unless a candidate fits an owner limit, and anything over
// authority is marked needs_owner with 0 allotted. Stage-aware: pre-revenue favours evidence-generating, revenue-adjacent work.
import { EXEC_AUTHORITY } from "./authority-defaults";
import { type ActivityTag, type ExecStage, policyFor } from "./validation-mode";

export type Resource = "ai_calls" | "engine_capacity" | "kly_sends" | "content_generation" | "owner_attention" | "owner_approved_money";
export const RESOURCES: Resource[] = ["ai_calls", "engine_capacity", "kly_sends", "content_generation", "owner_attention", "owner_approved_money"];

export interface Range { lo: number; mid: number; hi: number }
export interface Candidate {
  id: string; label: string; resource: Resource; tag: ActivityTag;
  /** Expected impact on the primary constraint, 0..10, as a range (honest uncertainty). */
  impact: Range;
  /** 0..1 confidence the impact estimate holds. */
  confidence: number;
  /** Units of the resource requested per week (money: cents). */
  cost: number;
  /** Weeks until evidence/impact shows. */
  timeWeeks: number;
  reversible: boolean;
  /** Cash out in cents (0 for non-money). Cash-flow adjustment penalises any cash use. */
  cashCents?: number;
  /** 0..1 risk of harm (reputation, deliverability, customer trust). */
  risk: number;
}

export interface Scored extends Candidate { score: Range; adjustments: string[] }
export interface AllocationLine { id: string; label: string; resource: Resource; tag: ActivityTag; allotted: number; spendCents: number; score: Range; status: "funded" | "partial" | "unfunded" | "needs_owner"; opportunityCost: string | null; note: string }
export interface AllocationPlan { stage: ExecStage; mode: string; spendCents: number; budgets: Record<Resource, number>; used: Record<Resource, number>; lines: AllocationLine[]; zeroSpendDefault: true; notes: string[] }

export const tagMultiplier = (stage: ExecStage, tag: ActivityTag): number => {
  const share = policyFor(stage).defaultShares[tag];
  return share === 0 ? 0.05 : 0.5 + share * 1.5; // pre-revenue: validation 1.55, maintain .875, build .575, scale .05
};

const moneyOverAuthority = (c: Candidate): boolean => (c.cashCents ?? 0) > 0 && (c.resource === "owner_approved_money" || (c.cashCents ?? 0) > EXEC_AUTHORITY.newPaidServiceCents);

/** impact x confidence / (cost x time), then stage, reversibility, cash-flow and risk adjustments. Range from the impact range. */
export function scoreCandidate(c: Candidate, stage: ExecStage): Scored {
  const adj: string[] = [];
  const denom = Math.max(1, c.cost) ** 0.5 * Math.max(1, c.timeWeeks); // sqrt: cost units differ per resource; time counts fully
  let m = tagMultiplier(stage, c.tag);
  adj.push(`${c.tag} work x${m.toFixed(2)} at ${stage}`);
  if (!c.reversible) { m *= 0.6; adj.push("irreversible x0.6"); }
  if ((c.cashCents ?? 0) > 0) { m *= 0.5; adj.push("uses cash x0.5"); }
  m *= 1 - Math.min(0.9, Math.max(0, c.risk)); if (c.risk > 0) adj.push(`risk ${Math.round(c.risk * 100)}%`);
  const f = (v: number) => Math.round(((v * Math.min(1, Math.max(0, c.confidence)) * m) / denom) * 1000) / 1000;
  // Low confidence widens the honest range downward: lo uses confidence squared.
  const lo = Math.round(((c.impact.lo * c.confidence ** 2 * m) / denom) * 1000) / 1000;
  return { ...c, score: { lo, mid: f(c.impact.mid), hi: f(c.impact.hi) }, adjustments: adj };
}

/** `buildAuthorised`: an approved/active build objective exists (it cited a measured primary constraint). Without one, build work is never funded: no manufactured development goals. */
export interface AllocationInput { stage: ExecStage; candidates: Candidate[]; capacity: Partial<Record<Resource, number>>; buildAuthorised?: boolean }

/** Per-resource weekly budgets within authority. Money budget is always 0 (owner-set limits: new services 0, Meta 0). */
export function defaultBudgets(capacity: Partial<Record<Resource, number>>): Record<Resource, number> {
  return {
    ai_calls: Math.min(capacity.ai_calls ?? EXEC_AUTHORITY.execAiCallsPerWeek, 1_000_000),
    engine_capacity: Math.max(0, capacity.engine_capacity ?? 0),
    kly_sends: Math.max(0, capacity.kly_sends ?? 0), // already the governor-limited weekly capacity; never above it
    content_generation: Math.max(0, capacity.content_generation ?? 0),
    owner_attention: Math.max(0, capacity.owner_attention ?? 3), // decisions per week the owner should be asked for
    owner_approved_money: 0,
  };
}

export function allocate(i: AllocationInput): AllocationPlan {
  const pol = policyFor(i.stage);
  const budgets = defaultBudgets(i.capacity);
  const used = Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
  const scored = i.candidates.map((c) => scoreCandidate(c, i.stage)).sort((a, b) => b.score.mid - a.score.mid || a.id.localeCompare(b.id));
  const lines: AllocationLine[] = [];
  const notes: string[] = [];
  // In validation modes, validation work is funded first inside each resource (the owner's default), then by score.
  const priority = (s: Scored) => (pol.defaultShares.validation >= 0.5 && s.tag === "validation" ? 1 : 0);
  const ordered = [...scored].sort((a, b) => priority(b) - priority(a) || b.score.mid - a.score.mid);
  for (const s of ordered) {
    const left = budgets[s.resource] - used[s.resource];
    const alt = scored.find((o) => o.resource === s.resource && o.id !== s.id && o.score.mid > s.score.mid);
    const opp = alt ? `funding this forgoes ${alt.label} (score ${alt.score.mid})` : null;
    const base = { id: s.id, label: s.label, resource: s.resource, tag: s.tag, score: s.score, opportunityCost: opp, spendCents: 0 };
    if (moneyOverAuthority(s)) { lines.push({ ...base, allotted: 0, status: "needs_owner", note: `would cost ${s.cashCents}c; spend authority is 0 for new services and Meta. Owner decision; nothing was spent.` }); continue; }
    if (pol.blockedKinds.includes(s.tag === "scale" ? "scale" : "__none__") || s.score.mid <= 0) { lines.push({ ...base, allotted: 0, status: "unfunded", note: s.tag === "scale" ? `held: scaling is blocked in ${pol.mode}` : "no expected impact" }); continue; }
    if (s.tag === "build" && !i.buildAuthorised) { lines.push({ ...base, allotted: 0, status: "unfunded", note: "held: no approved build objective backed by a measured constraint; building is not a default use of capacity" }); continue; }
    const give = Math.min(s.cost, Math.max(0, left));
    used[s.resource] += give;
    lines.push({ ...base, allotted: give, status: give >= s.cost ? "funded" : give > 0 ? "partial" : "unfunded", note: give >= s.cost ? s.adjustments.join("; ") : `only ${give}/${s.cost} ${s.resource} left in this week's budget` });
  }
  if (!lines.some((l) => l.status === "funded" || l.status === "partial")) notes.push("Nothing to fund this week: maintain operations and accumulate evidence.");
  notes.push("Plan spends $0. Authority: new paid services $0, Meta $0 (ads are off until proof), AI within the existing daily cap.");
  return { stage: i.stage, mode: pol.mode, spendCents: 0, budgets, used, lines, zeroSpendDefault: true, notes };
}

/** Share of funded units by activity tag (for the owner page / tests): shows validation dominance. */
export function sharesByTag(plan: AllocationPlan): Record<ActivityTag, number> {
  const t: Record<ActivityTag, number> = { validation: 0, maintain: 0, build: 0, scale: 0 };
  const funded = plan.lines.filter((l) => l.allotted > 0);
  for (const l of funded) t[l.tag] += 1;
  const n = funded.length || 1;
  for (const k of Object.keys(t) as ActivityTag[]) t[k] = Math.round((t[k] / n) * 100) / 100;
  return t;
}

/** Default candidate set for the current stage: existing, evidence-generating activities. Callers adjust capacity/inputs from real data. */
export function defaultCandidates(_stage: ExecStage, cap: { klySendsWeekly: number }): Candidate[] {
  const R = (lo: number, mid: number, hi: number): Range => ({ lo, mid, hi });
  return [
    { id: "cold_email_volume", label: "Cold email volume within governor limits", resource: "kly_sends", tag: "validation", impact: R(1, 5, 8), confidence: 0.5, cost: cap.klySendsWeekly, timeWeeks: 2, reversible: true, risk: 0.2 },
    { id: "reply_handling", label: "Reply and customer conversations", resource: "owner_attention", tag: "validation", impact: R(3, 7, 9), confidence: 0.6, cost: 2, timeWeeks: 1, reversible: true, risk: 0.05 },
    { id: "lead_magnet_funnel", label: "Lead magnet -> $9 -> upsell funnel measurement", resource: "ai_calls", tag: "validation", impact: R(2, 6, 8), confidence: 0.5, cost: 2, timeWeeks: 2, reversible: true, risk: 0.05 },
    { id: "first_customer_onboarding", label: "First-customer onboarding and outcome follow-up", resource: "engine_capacity", tag: "validation", impact: R(3, 7, 9), confidence: 0.6, cost: 1, timeWeeks: 1, reversible: true, risk: 0.05 },
    { id: "content_maintenance", label: "Keep content queue and proof pages current", resource: "content_generation", tag: "maintain", impact: R(0, 2, 4), confidence: 0.5, cost: 5, timeWeeks: 3, reversible: true, risk: 0.05 },
    { id: "new_feature_build", label: "Build a new feature", resource: "engine_capacity", tag: "build", impact: R(0, 2, 6), confidence: 0.3, cost: 5, timeWeeks: 6, reversible: false, risk: 0.2 },
    { id: "meta_ads_scale", label: "Scale Meta ads spend", resource: "owner_approved_money", tag: "scale", impact: R(0, 3, 7), confidence: 0.2, cost: 1, timeWeeks: 4, reversible: false, cashCents: 50_000, risk: 0.4 },
  ];
}

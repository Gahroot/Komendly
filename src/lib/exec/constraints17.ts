// 17-constraint taxonomy on top of src/lib/revenue/constraints.ts (reused, not duplicated): each constraint has evidence, an explicit
// "insufficient_evidence" state, a rule-based root cause, and ONE primary constraint with confidence + what evidence would change it.
// Pure TS. Where the revenue snapshot has no signal, the constraint stays insufficient_evidence; we never infer from silence.
import type { Constraint as RevConstraint, BusinessStage } from "../revenue/constraints";
import type { Economics } from "../revenue/economics";
import type { EvidenceItem, EvidenceLevel } from "./types";

export const CONSTRAINT_IDS = [
  "market_demand", "audience_selection", "offer_attractiveness", "acquisition", "lead_conversion", "sales", "activation", "product_quality", "outcomes",
  "retention", "expansion", "pricing", "delivery_economics", "cash_flow", "reliability", "capacity", "competitive_position",
] as const;
export type ConstraintId = (typeof CONSTRAINT_IDS)[number];
export const MIN_MEASURED_N = 30; // same as economics MIN_N_MEASURED
export const MIN_INFERRED_N = 5;

export interface ConstraintInputs {
  revenue: { constraints: RevConstraint[]; economics: Economics | null; stage: BusinessStage } | null;
  /** Direct customer answers ("why didn't you buy"): replies received and how many named a price/offer objection. */
  customerVoice?: { replies: number; priceObjections: number; offerObjections: number; noInterest: number } | null;
  ops?: { openIncidents: number; failingSystems: number; infraFailures: number } | null;
  finance?: { runwayMonths: number | null; netCashCents: number | null } | null;
  competitive?: { gapsOnKeyCriteria: number; scored: number } | null;
  outcomes?: { measured: number; positive: number } | null;
  capacity?: { queueBacklog: number; ownerHoursShort: boolean } | null;
}
export interface ConstraintResult {
  id: ConstraintId; label: string; status: "evidenced" | "insufficient_evidence"; severity: number; level: EvidenceLevel; n: number;
  evidence: EvidenceItem[]; rootCause: string; /** true when the note names a symptom and the real cause still needs evidence */ causeUnproven: boolean; source: string;
}
export interface PrimaryConstraint {
  id: ConstraintId | null; confidence: "high" | "medium" | "low" | "none"; reason: string; whatWouldChange: string[];
}
export interface ConstraintReport { results: ConstraintResult[]; primary: PrimaryConstraint; /** true when no constraint has measured evidence: the strategy must default to hold_and_measure. */ sampleBelowThreshold: boolean }

const LABELS: Record<ConstraintId, string> = {
  market_demand: "Market demand", audience_selection: "Audience selection", offer_attractiveness: "Offer attractiveness", acquisition: "Acquisition", lead_conversion: "Lead conversion",
  sales: "Sales", activation: "Activation", product_quality: "Product quality", outcomes: "Customer outcomes", retention: "Retention", expansion: "Expansion", pricing: "Pricing",
  delivery_economics: "Delivery economics", cash_flow: "Cash flow", reliability: "Reliability", capacity: "Capacity", competitive_position: "Competitive position",
};
const levelOfN = (n: number): EvidenceLevel => (n >= MIN_MEASURED_N ? "measured" : n >= MIN_INFERRED_N ? "inferred" : "assumed");
const sevCap = (x: number) => Math.round(Math.min(Math.max(x, 1), 5) * 100) / 100;

/** Root-cause rules: say what the evidence supports, and flag symptom-only notes. */
const ROOT: Record<string, (r: RevConstraint) => { text: string; unproven: boolean }> = {
  traffic: (r) => ({ text: r.n < MIN_MEASURED_N ? "Few visits recorded. Could be low reach or an attribution gap; check tracking before concluding demand is weak." : "Reach is below the benchmark. Cause (channel mix, creative, targeting) is not yet separated by channel data.", unproven: true }),
  activation: () => ({ text: "Sign-ups do not finish a pack. Candidate causes: time-to-first-ad, input friction, render failures; failed AdRun errors separate them.", unproven: true }),
  first_purchase: () => ({ text: "Activated users do not buy. Candidate causes: offer clarity, risk, price; the 'why didn't you buy' answers are the direct evidence.", unproven: true }),
  upsell: () => ({ text: "Upsell is shown but not taken; it only matters once the first purchase works.", unproven: true }),
  delivery: () => ({ text: "Packs fail to finish. Read failed AdRun error classes; this is a defect, not a demand question.", unproven: false }),
  retention: () => ({ text: "Subscribers leave early. Cancellation feedback is the direct evidence.", unproven: true }),
  economics: () => ({ text: "Payback or LTGP:CAC is below target; fix cash per customer before spending to acquire.", unproven: false }),
};

export function diagnoseExecConstraints(inp: ConstraintInputs): ConstraintReport {
  const out = new Map<ConstraintId, ConstraintResult>();
  const insufficient = (id: ConstraintId, why: string): ConstraintResult => ({ id, label: LABELS[id], status: "insufficient_evidence", severity: 1, level: "assumed", n: 0, evidence: [{ level: "assumed", text: why, constraintId: id }], rootCause: "Unknown: not enough evidence to name a cause.", causeUnproven: true, source: "none" });
  for (const id of CONSTRAINT_IDS) out.set(id, insufficient(id, "No measurement of this yet."));
  const set = (id: ConstraintId, n: number, severity: number, evidence: string, root: { text: string; unproven: boolean }, source: string, minN = MIN_INFERRED_N) => {
    if (n < minN) { out.set(id, { ...insufficient(id, `Only ${n} observations (need ${minN}+): ${evidence}`), n, source }); return; }
    out.set(id, { id, label: LABELS[id], status: "evidenced", severity: sevCap(severity), level: levelOfN(n), n, evidence: [{ level: levelOfN(n), text: evidence, eventId: "revenue_snapshot", constraintId: id }], rootCause: root.text, causeUnproven: root.unproven, source });
  };
  const rev = inp.revenue;
  const mapRev: Array<[string, ConstraintId[]]> = [["traffic", ["acquisition"]], ["activation", ["activation"]], ["first_purchase", ["offer_attractiveness"]], ["upsell", ["expansion"]], ["delivery", ["product_quality"]], ["retention", ["retention"]], ["economics", ["delivery_economics"]]];
  if (rev) {
    for (const [key, ids] of mapRev) {
      const c = rev.constraints.find((x) => x.key === key);
      if (!c) continue;
      // a sub-threshold revenue constraint is insufficient: severity from a handful of observations is noise
      for (const id of ids) set(id, c.confidence === "insufficient" ? 0 : c.n, c.severity, c.evidence, (ROOT[key] ?? ROOT.traffic!)(c), `revenue.constraints.${key}`, c.confidence === "insufficient" ? 1 : MIN_INFERRED_N);
    }
    const e = rev.economics;
    if (e) {
      const v = e.rates.visitToSignup;
      if (v.n > 0) set("lead_conversion", v.n, v.value === null ? 1 : 0.03 / Math.max(v.value, 0.001), `${v.successes}/${v.n} visits became sign-ups (${v.value === null ? "n/a" : (v.value * 100).toFixed(1)}%; benchmark 3% is an assumption).`, { text: "Landing-to-sign-up conversion; separate by channel before blaming the page.", unproven: true }, "economics.rates.visitToSignup");
      const ch = e.byChannel.filter((c) => c.signups >= MIN_MEASURED_N);
      if (ch.length >= 2) {
        const rates = ch.map((c) => c.activationRate.value ?? 0), spread = Math.max(...rates) - Math.min(...rates);
        set("audience_selection", ch.reduce((t, c) => t + c.signups, 0), 1 + spread * 4, `Activation differs by ${(spread * 100).toFixed(0)} pts across ${ch.length} channels (${ch.map((c) => `${c.channel} ${((c.activationRate.value ?? 0) * 100).toFixed(0)}%`).join(", ")}).`, { text: "Some audiences activate far better than others; shift effort toward the better one.", unproven: true }, "economics.byChannel");
      }
      if (e.cashFlow.confidence !== "insufficient" && e.cashFlow.outCents > 0) set("cash_flow", MIN_INFERRED_N, e.cashFlow.netCents < 0 ? 2 : 1, `Net cash ${e.cashFlow.netCents} cents (in ${e.cashFlow.inCents}, out ${e.cashFlow.outCents}) in the window.`, { text: "Costs exceed receipts while pre-revenue; this is expected until first customers, and bounded by owner spend authority.", unproven: false }, "economics.cashFlow");
      if (e.refunds.count > 0 && e.payingCustomers >= MIN_INFERRED_N) set("pricing", e.payingCustomers, 1 + e.refunds.count / e.payingCustomers * 4, `${e.refunds.count} refunds across ${e.payingCustomers} paying customers.`, { text: "Refunds hint at expectation or price mismatch; read refund reasons.", unproven: true }, "economics.refunds");
    }
  }
  const v = inp.customerVoice;
  if (v && v.replies > 0) {
    if (v.priceObjections > 0) set("pricing", v.replies, 1 + (v.priceObjections / v.replies) * 4, `${v.priceObjections}/${v.replies} customer replies cite price.`, { text: "Direct customer statements about price; small sample, treat as signal not proof.", unproven: v.replies < MIN_MEASURED_N }, "customerVoice", 1);
    if (v.offerObjections > 0 && (out.get("offer_attractiveness")?.status !== "evidenced")) set("offer_attractiveness", v.replies, 1 + (v.offerObjections / v.replies) * 4, `${v.offerObjections}/${v.replies} replies say the offer is unclear or not what they need.`, { text: "Direct customer statements about the offer.", unproven: v.replies < MIN_MEASURED_N }, "customerVoice", 1);
    if (v.noInterest > 0) set("market_demand", v.replies, 1 + (v.noInterest / v.replies) * 4, `${v.noInterest}/${v.replies} replies say they have no need for this.`, { text: "Stated lack of need; check whether the audience, not the market, is wrong.", unproven: true }, "customerVoice", 1);
  }
  const o = inp.ops;
  if (o) {
    const n = o.openIncidents + o.failingSystems + o.infraFailures;
    if (n > 0) set("reliability", MIN_MEASURED_N, 1 + n, `${o.openIncidents} open incidents, ${o.failingSystems} failing systems, ${o.infraFailures} infra check failures.`, { text: "Operational failures recorded by the ops layer; fix the failing component.", unproven: false }, "ops");
  }
  const f = inp.finance;
  if (f && f.runwayMonths !== null && f.runwayMonths < 6) set("cash_flow", MIN_INFERRED_N, 6 / Math.max(f.runwayMonths, 0.5), `Runway ${f.runwayMonths} months.`, { text: "Short runway.", unproven: false }, "finance");
  const c = inp.competitive;
  if (c && c.scored >= MIN_INFERRED_N && c.gapsOnKeyCriteria > 0) set("competitive_position", c.scored, 1 + c.gapsOnKeyCriteria / c.scored * 2, `${c.gapsOnKeyCriteria} of ${c.scored} scored criteria trail the best competitor (public-sourced scorecard, not customer data).`, { text: "Scorecard gaps are not proof customers choose competitors for them; verify with lost-deal answers.", unproven: true }, "competitive", MIN_INFERRED_N);
  const oc = inp.outcomes;
  if (oc && oc.measured > 0) set("outcomes", oc.measured, oc.positive / oc.measured < 0.5 ? 2.5 : 1, `${oc.positive}/${oc.measured} measured customer outcomes were positive.`, { text: "Customer results; fix what delivers the weakest results.", unproven: true }, "outcomes");
  const cap = inp.capacity;
  if (cap && (cap.queueBacklog > 20 || cap.ownerHoursShort)) set("capacity", Math.max(cap.queueBacklog, MIN_INFERRED_N), 1 + cap.queueBacklog / 20, `Queue backlog ${cap.queueBacklog}; owner hours short: ${cap.ownerHoursShort}.`, { text: "Work waits on capacity.", unproven: false }, "capacity");
  // `sales`: self-serve + reply-driven today; no sales-call data exists. Stays insufficient by design.
  out.set("sales", { ...out.get("sales")!, evidence: [{ level: "assumed", text: "No sales-call or human-sales data exists (self-serve and reply-driven).", constraintId: "sales" }] });

  const results = CONSTRAINT_IDS.map((id) => out.get(id)!);
  return { results, ...pickPrimary(results, rev?.stage.index ?? 0) };
}

const weight = (r: ConstraintResult) => r.severity * (r.level === "measured" ? 1 : r.level === "inferred" ? 0.7 : 0.3);
function pickPrimary(results: ConstraintResult[], stageIndex: number): { primary: PrimaryConstraint; sampleBelowThreshold: boolean } {
  const ev = results.filter((r) => r.status === "evidenced").sort((a, b) => weight(b) - weight(a));
  const measured = ev.filter((r) => r.level === "measured");
  const sampleBelowThreshold = measured.length === 0;
  const need = results.filter((r) => r.status === "insufficient_evidence").slice(0, 5).map((r) => `${r.label}: more observations (need ${MIN_INFERRED_N}+ to infer, ${MIN_MEASURED_N}+ to measure)`);
  if (!ev.length) return { sampleBelowThreshold, primary: { id: null, confidence: "none", reason: `No constraint has enough evidence (stage ${stageIndex}); the right move is to keep operating and gather evidence.`, whatWouldChange: need } };
  const top = ev[0]!, second = ev[1];
  const gap = second ? weight(top) / Math.max(weight(second), 0.01) : 2;
  const confidence: PrimaryConstraint["confidence"] = top.level === "measured" && gap >= 1.3 ? "high" : top.level === "assumed" ? "low" : "medium";
  const changes = [`A measured (${MIN_MEASURED_N}+) sample for ${second ? second.label : "another step"} outranking ${top.label}`, ...(top.level !== "measured" ? [`${top.label} reaching ${MIN_MEASURED_N}+ observations`] : []), ...(top.causeUnproven ? [`Direct customer evidence naming the cause behind ${top.label}`] : [])];
  return { sampleBelowThreshold, primary: { id: top.id, confidence, reason: `${top.label} ranks first (severity ${top.severity}, ${top.level}, n=${top.n}). ${top.rootCause}`, whatWouldChange: changes } };
}

/** Strict schema for Codex root-cause summarisation: it may only attach notes to known ids; it can never change the primary. */
export const ROOT_CAUSE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["notes"],
  properties: { notes: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["id", "note", "causeIsProven"], properties: { id: { type: "string", enum: [...CONSTRAINT_IDS] }, note: { type: "string", maxLength: 400 }, causeIsProven: { type: "boolean" } } } } },
} as const;
export function applyRootCauseNotes(report: ConstraintReport, raw: unknown): ConstraintReport {
  const notes = (raw as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(notes)) return report;
  const results = report.results.map((r) => {
    const n = notes.find((x) => x && typeof x === "object" && (x as { id?: unknown }).id === r.id) as { note?: unknown; causeIsProven?: unknown } | undefined;
    if (!n || typeof n.note !== "string" || !n.note.trim() || r.status !== "evidenced") return r; // never colour an insufficient-evidence constraint
    return { ...r, rootCause: `${r.rootCause} AI note: ${n.note.trim().slice(0, 400)}`, causeUnproven: r.causeUnproven || n.causeIsProven !== true };
  });
  return { ...report, results };
}

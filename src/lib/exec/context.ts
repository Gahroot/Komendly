// The whole-business context snapshot (AdsEvent `exec_context`, daily). A pure assembler over snapshots and registries that already exist:
// it measures nothing itself and invents nothing; absent inputs become explicit "not available" sections graded assumed.
import type { RevenueSnapshot } from "../revenue/snapshot";
import type { ConstraintInputs } from "./constraints17";
import type { EvidenceLevel } from "./types";

export interface Section<T> { level: EvidenceLevel; source: string; data: T | null; note?: string }
export interface ChannelView { source: string; label: string; actions: number | null; signups: number; payments: number; flagOn?: boolean }
export interface ContextInput {
  now: Date; snapshot: RevenueSnapshot | null; channels: ChannelView[];
  flags: Record<string, boolean>;
  finance: { props: Record<string, unknown> } | null; incidents: { open: number; recent: Array<Record<string, unknown>> } | null; infra: { failures: number; total: number } | null;
  systemStatus: Array<{ id: string; status: string }> | null; competitive: { scored: number; gapsOnKeyCriteria: number; summary?: string } | null;
  spendAuthority: Record<string, number> | null; ownerDecisions: Array<{ text: string; at?: string }>;
  optimizerActions: Array<Record<string, unknown>>; opsDecisions: Array<Record<string, unknown>>; learnings: Array<Record<string, unknown>>; experiments: Array<{ key: string; status: string; hypothesis?: string }>; hypotheses: Array<{ text: string }>;
  customerVoice: ConstraintInputs["customerVoice"]; outcomes: ConstraintInputs["outcomes"];
}

/** Static registry: what Komendly sells and the rules it runs under. Source = MEMORY.md (24-26 Nov owner decisions) and src/lib/ads/public-offer.ts. Review when the offer changes. */
export const PRODUCTS = [
  { id: "free_pack", name: "Free ad pack (10 ads)", priceCents: 0, role: "attraction" },
  { id: "unlock_pack", name: "Unlock pack", priceCents: 900, role: "first yes" },
  { id: "growth_autopilot", name: "Ozzy's AI Marketing Team (Growth Autopilot)", priceCents: 29700, role: "core offer (founding price, 10 spots; first month $97 launch coupon)", recurring: true },
  { id: "ad_department_diy", name: "Ad Department (DIY)", priceCents: 9700, role: "downsell ($97 then $197)", recurring: true },
  { id: "testimonials", name: "Testimonial videos", priceCents: null, role: "legacy product line" },
  { id: "ozzy_studio", name: "Ozzy Studio", priceCents: null, role: "promo/launch video product" },
] as const;
export const SEGMENTS = ["local service businesses (roofers, home trades)", "health professionals", "agencies (secondary)"] as const;
export const HARD_RULES = [
  "Spend is 0 unless the owner authorises it (src/lib/ops/finance/authority.ts).", "No paid directories.", "Never invent a postal address (only Kly OUTBOUND_POSTAL_ADDRESS).",
  "Referred friends keep the full 20-ad pack free.", "New Meta ad sets stay on PURCHASE optimisation; all Meta ads currently OFF by owner decision (26 Nov).",
  "Experiment (owner 26 Nov): AI makes money with the owner never manually involved; the system handles replies.", "Executive layer never changes prices, caps, billing or legal text, and never raises its own authority.",
] as const;

const sec = <T>(level: EvidenceLevel, source: string, data: T | null, note?: string): Section<T> => (data === null ? { level: "assumed", source, data, note: note ?? "not available" } : { level, source, data, ...(note ? { note } : {}) });

export function buildBusinessContext(i: ContextInput) {
  const s = i.snapshot, e = s?.economics ?? null;
  const confLevel = (c: string): EvidenceLevel => (c === "measured" ? "measured" : c === "estimated" ? "inferred" : "assumed");
  const sections = {
    products: sec<unknown>("measured", "registry: public-offer + MEMORY", { items: PRODUCTS }),
    moneyModel: sec<unknown>("assumed", "MEMORY 26 Nov Hormozi pass", { attraction: "10 free ads", firstYes: "$9 unlock", upsell: "Growth Autopilot first month $97 then $297", downsell: "DIY $97/$197", continuity: "monthly" }, "Designed model: no conversion between steps has been proven"),
    segments: sec<unknown>("assumed", "registry", { items: SEGMENTS }, "target segments, not measured buyers"),
    channels: i.channels.length ? sec("measured", "growth systems + signed_up first touch", { items: i.channels, outcomesNote: "payments = paying workspaces traced to the channel's first touch" }) : sec("assumed", "growth systems", null, "no channel activity recorded"),
    revenue: s && e ? sec("measured", "revenue_snapshot (internal/test accounts excluded)", { payingCustomers: e.payingCustomers, allTimeRevenueCents: e.revenue.allTimeCents, mrrCents: e.mrrCents.cents, windowDays: e.windowDays, funnel: e.funnel, day: s.day }) : sec("assumed", "revenue_snapshot", null, "no revenue snapshot yet"),
    economics: e ? sec(confLevel(e.ltgpToCac.confidence), "revenue_snapshot.economics", { cacCents: e.cacCents, ltgpToCac: e.ltgpToCac, payback30: e.payback30, assumptions: e.assumptions, cashFlow: e.cashFlow }, "LTV/churn use stated assumptions until 10+ subscribers have 90+ days") : sec("assumed", "economics", null),
    stage: s ? sec("measured", "revenue/constraints.businessStage", { index: s.stage.index, code: s.stage.code, label: s.stage.label, notYet: s.stage.notYet, nextMilestone: s.stage.nextMilestone }) : sec("assumed", "stage", { index: 0, code: "improvise", label: "Pre-revenue (assumed: no snapshot)" }, "defaulting to the strictest stage"),
    outcomes: i.outcomes ? sec("inferred", "outcome_verify", i.outcomes) : sec("assumed", "outcome_verify", null, "no measured customer outcomes"),
    customerVoice: i.customerVoice ? sec("measured", "inbound replies classified", i.customerVoice) : sec("assumed", "inbound replies", null, "no why-not-buy answers captured yet"),
    competitivePosition: i.competitive ? sec("inferred", "docs/product/competitive.json (public-sourced)", i.competitive, "public sources, not customer data") : sec("assumed", "competitive", null),
    health: sec("measured", "finance_snapshot, incident, infra_check, system_status", i.finance || i.incidents || i.infra || i.systemStatus ? { finance: i.finance?.props ?? null, openIncidents: i.incidents?.open ?? null, infraFailures: i.infra?.failures ?? null, failingSystems: i.systemStatus ? i.systemStatus.filter((x) => x.status === "failing").length : null } : null),
    resources: sec("measured", "src/lib/ops/finance/authority.ts", i.spendAuthority ? { spendAuthority: i.spendAuthority, ownerInvolvement: "none by design (26 Nov experiment)" } : null),
    commitments: sec("measured", "CLAUDE.md + MEMORY owner decisions", { hardRules: HARD_RULES, ownerDecisions: i.ownerDecisions.slice(0, 10) }),
    history: sec("measured", "optimizer_action, ops_decision, learnings, experiments", { optimizerActions: i.optimizerActions.slice(0, 10), opsDecisions: i.opsDecisions.slice(0, 10), learnings: i.learnings.slice(0, 10), experiments: i.experiments }),
    systemsOn: sec("measured", "AdsFeatureFlag", { on: Object.entries(i.flags).filter(([, v]) => v).map(([k]) => k).sort() }),
  };
  const counts: Record<EvidenceLevel, number> = { measured: 0, inferred: 0, assumed: 0 };
  for (const v of Object.values(sections)) counts[(v as Section<unknown>).level]++;
  return { day: i.now.toISOString().slice(0, 10), generatedAt: i.now.toISOString(), mode: (s?.stage.index ?? 0) === 0 ? "commercial_validation" : "growth", evidenceSummary: counts, sections };
}
export type BusinessContext = ReturnType<typeof buildBusinessContext>;

/** Constraint inputs derived from the context input (single place that maps ops signals to the taxonomy). */
export function constraintInputsOf(i: ContextInput): ConstraintInputs {
  const rev = i.snapshot ? { constraints: i.snapshot.constraints, economics: i.snapshot.economics, stage: i.snapshot.stage } : null;
  const runway = i.finance && typeof i.finance.props.runwayMonths === "number" ? (i.finance.props.runwayMonths as number) : null;
  return {
    revenue: rev, customerVoice: i.customerVoice, outcomes: i.outcomes, competitive: i.competitive ? { gapsOnKeyCriteria: i.competitive.gapsOnKeyCriteria, scored: i.competitive.scored } : null,
    ops: { openIncidents: i.incidents?.open ?? 0, failingSystems: i.systemStatus?.filter((x) => x.status === "failing").length ?? 0, infraFailures: i.infra?.failures ?? 0 },
    finance: i.finance ? { runwayMonths: runway, netCashCents: null } : null,
  };
}

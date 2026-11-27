// COMMERCIAL VALIDATION MODE. Komendly is pre-revenue and capability exceeds commercial maturity: the default is to run the
// existing channels and accumulate evidence (who buys, why, which channel yields payers, do customers get outcomes), not to
// invent build work. "Maintain operations and accumulate evidence" is a valid outcome. Pure.
export type ExecStage = "pre_revenue" | "first_customers" | "repeatable" | "scaling";
export type ExecMode = "commercial_validation" | "learn_from_customers" | "optimise" | "scale";

export interface StageFacts { payingCustomers: number; mrrCents: number | null; profitableMonths?: number }

export function stageOf(f: StageFacts): ExecStage {
  if (f.payingCustomers <= 0) return "pre_revenue";
  if (f.payingCustomers < 10) return "first_customers";
  return (f.profitableMonths ?? 0) >= 3 ? "scaling" : "repeatable";
}
/** Maps to the index used by stage.ts (allowed strategies). The strategy engine and the coordinator therefore share ONE stage definition. */
export const stageIndexOf = (s: ExecStage): number => ({ pre_revenue: 0, first_customers: 1, repeatable: 2, scaling: 3 } as const)[s];
export const modeOf = (s: ExecStage): ExecMode => ({ pre_revenue: "commercial_validation", first_customers: "learn_from_customers", repeatable: "optimise", scaling: "scale" } as const)[s];

export interface ModePolicy {
  mode: ExecMode;
  banner: string;
  /** Default weekly allocation shares by activity tag (sum 1). */
  defaultShares: Record<ActivityTag, number>;
  /** Objective/build kinds that must not appear in this mode. */
  blockedKinds: string[];
  /** Strategy label the weekly cycle should land on when nothing is clearly better. */
  defaultStrategy: "hold_and_measure" | "learn_and_fix" | "optimise_constraint" | "scale_proven";
}
export type ActivityTag = "validation" | "maintain" | "build" | "scale";

export function policyFor(stage: ExecStage): ModePolicy {
  switch (stage) {
    case "pre_revenue": return {
      mode: "commercial_validation", defaultStrategy: "hold_and_measure",
      banner: "COMMERCIAL VALIDATION MODE: evidence gathering. Running the existing channels and measuring; no scaling, no new products, no new spend until real buyers show what works.",
      defaultShares: { validation: 0.7, maintain: 0.25, build: 0.05, scale: 0 },
      blockedKinds: ["scale", "new_product", "new_channel_build", "price_change", "paid_acquisition", "new_system"],
    };
    case "first_customers": return {
      mode: "learn_from_customers", defaultStrategy: "learn_and_fix",
      banner: "LEARNING FROM FIRST CUSTOMERS: talk to them, make sure they get outcomes, and learn why they bought. No scaling yet.",
      defaultShares: { validation: 0.55, maintain: 0.25, build: 0.2, scale: 0 },
      blockedKinds: ["scale", "paid_acquisition", "new_system"],
    };
    case "repeatable": return {
      mode: "optimise", defaultStrategy: "optimise_constraint",
      banner: "OPTIMISING: one constraint at a time on a funnel that has started to repeat.",
      defaultShares: { validation: 0.3, maintain: 0.2, build: 0.3, scale: 0.2 }, blockedKinds: ["new_system"],
    };
    default: return {
      mode: "scale", defaultStrategy: "scale_proven",
      banner: "SCALING what is proven; owner approval still required for money.",
      defaultShares: { validation: 0.2, maintain: 0.2, build: 0.2, scale: 0.4 }, blockedKinds: [],
    };
  }
}

export interface EvidenceFacts {
  signups30d: number; freePacksFinished30d: number; unlocks9Total: number; payingCustomers: number;
  coldSends30d: number; replies30d: number; customerConversations: number;
}
export interface EvidenceLine { key: string; label: string; have: number; need: number; decides: string; met: boolean }

/** Thresholds are rules of thumb for "enough to read a trend", not statistical proof. They are shown to the owner as such. */
export function evidenceScoreboard(f: EvidenceFacts): EvidenceLine[] {
  const L = (key: string, label: string, have: number, need: number, decides: string): EvidenceLine => ({ key, label, have, need, decides, met: have >= need });
  return [
    L("signups", "free-pack sign-ups (30d)", f.signups30d, 30, "whether the traffic source converts to sign-ups at all"),
    L("activation", "free packs finished (30d)", f.freePacksFinished30d, 15, "whether sign-ups reach the value moment (step: first ads ready)"),
    L("unlock9", "$9 unlocks (all time)", f.unlocks9Total, 5, "whether the $9 step is the right first purchase before any upsell work"),
    L("payers", "paying customers", f.payingCustomers, 3, "who buys and why; which channel yields payers"),
    L("replies", "cold-email replies (30d)", f.replies30d, 10, "whether the cold-email message resonates (volume stays within governor limits)"),
    L("conversations", "customer conversations", f.customerConversations, 5, "what buyers and non-buyers say about the offer"),
  ];
}
export const scoreboardSentence = (l: EvidenceLine) => (l.met ? `${l.label}: ${l.have} (enough to read ${l.decides})` : `needs ${l.need - l.have} more ${l.label} (have ${l.have}/${l.need}) to decide ${l.decides}`);

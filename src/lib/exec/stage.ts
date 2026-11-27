// Stage-appropriateness filter: which kinds of strategy are allowed at each Scaling Roadmap stage (src/lib/revenue/constraints.ts businessStage).
// Source of the "not yet" rules: docs/revenue/hormozi-frameworks.md + businessStage().notYet. Pure.
export const STRATEGIES = [
  "hold_and_measure", "gather_customer_feedback", "operate_existing_channels", "offer_message_experiment", "fix_funnel_step", "fix_reliability",
  "new_channel", "scale_paid_ads", "pricing_change", "new_product", "enterprise", "hire_or_outsource", "automate_delivery",
] as const;
export type Strategy = (typeof STRATEGIES)[number];

const ALWAYS: Strategy[] = ["hold_and_measure", "gather_customer_feedback", "operate_existing_channels", "fix_reliability"];
const BY_STAGE: Record<number, Strategy[]> = {
  0: [...ALWAYS, "offer_message_experiment", "fix_funnel_step"], // pre-revenue: find first customers; no scaling, pricing, products, enterprise
  1: [...ALWAYS, "offer_message_experiment", "fix_funnel_step"], // first revenue: improve the ladder step with the biggest drop
  2: [...ALWAYS, "offer_message_experiment", "fix_funnel_step", "new_channel", "scale_paid_ads", "pricing_change"],
  3: [...ALWAYS, "offer_message_experiment", "fix_funnel_step", "new_channel", "scale_paid_ads", "pricing_change", "automate_delivery", "hire_or_outsource", "new_product"],
};
/** Unknown stage fails closed to the strictest list. */
export function allowedStrategies(stageIndex: number): readonly Strategy[] {
  return BY_STAGE[stageIndex] ?? BY_STAGE[0]!;
}
export const isStrategyAllowed = (stageIndex: number, s: string): boolean => (allowedStrategies(stageIndex) as readonly string[]).includes(s);

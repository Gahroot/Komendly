// Pure plan/price mapping for Stripe subscriptions, covering grandfathered and current prices.
// Legacy price IDs (STRIPE_<PLAN>_<CYCLE>_PRICE_ID) keep their original minutes; everything else is current.

import { LEGACY_PLAN_MINUTES, PLAN_CONFIG, PLAN_PRICE_VERSION, type PlanKey } from "./stripe-config";

export type Cycle = "monthly" | "yearly";
export type PriceIds = Record<PlanKey, Partial<Record<Cycle, string | undefined>>>;

const PLAN_KEYS = Object.keys(PLAN_CONFIG) as PlanKey[];

export function isPlanKey(v: unknown): v is PlanKey {
  return typeof v === "string" && (PLAN_KEYS as string[]).includes(v);
}

function findIn(ids: PriceIds, priceId: string): PlanKey | null {
  for (const k of PLAN_KEYS) {
    const p = ids[k];
    if (p.monthly === priceId || p.yearly === priceId) return k;
  }
  return null;
}

export interface SubscriptionPriceInfo {
  priceId?: string | null;
  /** subscription.metadata.planKey (set by our checkout). */
  metadataPlanKey?: string | null;
  /** price.unit_amount in cents and recurring interval, for inline prices without metadata. */
  unitAmount?: number | null;
  interval?: string | null;
  /** The user's stored plan, last resort. */
  fallbackPlan?: string | null;
}

export interface ResolvedPlan {
  plan: PlanKey;
  minutes: number;
  legacy: boolean;
}

/** Which plan and how many minutes a subscription price is worth. Null when it can't be identified. */
export function resolvePlan(info: SubscriptionPriceInfo, legacyIds: PriceIds, currentIds: PriceIds): ResolvedPlan | null {
  const priceId = info.priceId ?? "";
  if (priceId) {
    const cur = findIn(currentIds, priceId);
    if (cur) return { plan: cur, minutes: PLAN_CONFIG[cur].minutesPerMonth, legacy: false };
    const old = findIn(legacyIds, priceId);
    if (old) return { plan: old, minutes: LEGACY_PLAN_MINUTES[old], legacy: true };
  }
  // Unknown price id = inline price_data from our current checkout.
  let plan: PlanKey | null = isPlanKey(info.metadataPlanKey) ? info.metadataPlanKey : null;
  if (!plan && typeof info.unitAmount === "number") {
    const yearlyInterval = info.interval === "year";
    plan = PLAN_KEYS.find((k) => (yearlyInterval ? PLAN_CONFIG[k].yearlyPrice : PLAN_CONFIG[k].monthlyPrice) * 100 === info.unitAmount) ?? null;
  }
  if (!plan && isPlanKey(info.fallbackPlan)) plan = info.fallbackPlan;
  if (!plan) return null;
  return { plan, minutes: PLAN_CONFIG[plan].minutesPerMonth, legacy: false };
}

/** Line item for a new subscription: configured v2 price ID if set, else inline price_data (never a legacy ID). */
export function subscriptionLineItem(plan: PlanKey, cycle: Cycle, currentIds: PriceIds) {
  const id = currentIds[plan][cycle];
  if (id) return { price: id, quantity: 1 };
  const cfg = PLAN_CONFIG[plan];
  return {
    price_data: {
      currency: "usd",
      unit_amount: (cycle === "yearly" ? cfg.yearlyPrice : cfg.monthlyPrice) * 100,
      recurring: { interval: cycle === "yearly" ? ("year" as const) : ("month" as const) },
      product_data: { name: `Komendly ${cfg.name}`, metadata: { planKey: plan, version: PLAN_PRICE_VERSION } },
    },
    quantity: 1,
  };
}

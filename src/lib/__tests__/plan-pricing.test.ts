import { describe, expect, it } from "vitest";
import { resolvePlan, subscriptionLineItem, type PriceIds } from "../plan-pricing";

const legacy: PriceIds = { starter: { monthly: "old_s_m", yearly: "old_s_y" }, pro: { monthly: "old_p_m" }, enterprise: { monthly: "old_e_m" } };
const none: PriceIds = { starter: {}, pro: {}, enterprise: {} };
const current: PriceIds = { starter: { monthly: "new_s_m" }, pro: {}, enterprise: {} };

describe("resolvePlan", () => {
  it("keeps grandfathered minutes for legacy price ids", () => {
    expect(resolvePlan({ priceId: "old_s_m" }, legacy, none)).toEqual({ plan: "starter", minutes: 3, legacy: true });
    expect(resolvePlan({ priceId: "old_p_m" }, legacy, none)).toEqual({ plan: "pro", minutes: 20, legacy: true });
    expect(resolvePlan({ priceId: "old_e_m" }, legacy, none)?.minutes).toBe(60);
  });
  it("gives current minutes for v2 ids, metadata, or matching inline amounts", () => {
    expect(resolvePlan({ priceId: "new_s_m" }, legacy, current)).toEqual({ plan: "starter", minutes: 10, legacy: false });
    expect(resolvePlan({ priceId: "price_inline", metadataPlanKey: "pro" }, legacy, none)?.minutes).toBe(30);
    expect(resolvePlan({ priceId: "price_inline", unitAmount: 99700, interval: "month" }, legacy, none)?.plan).toBe("enterprise");
    expect(resolvePlan({ priceId: "price_inline", unitAmount: 197000, interval: "year" }, legacy, none)?.plan).toBe("starter");
  });
  it("falls back to the stored plan, else null", () => {
    expect(resolvePlan({ priceId: "x", fallbackPlan: "pro" }, legacy, none)?.minutes).toBe(30);
    expect(resolvePlan({ priceId: "x" }, legacy, none)).toBeNull();
  });
});

describe("subscriptionLineItem", () => {
  it("uses inline recurring price_data unless a v2 price id is configured", () => {
    expect(subscriptionLineItem("starter", "monthly", current)).toEqual({ price: "new_s_m", quantity: 1 });
    expect(subscriptionLineItem("pro", "yearly", none)).toMatchObject({ price_data: { unit_amount: 497000, recurring: { interval: "year" } } });
  });
});

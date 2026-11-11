import { describe, expect, it } from "vitest";
import { ADS_PLANS, ADS_TOPUPS, annualCredits, annualPriceCents } from "../billing-config";
import { marginAt, P90_PER_CREDIT } from "../../../../scripts/ads-pricing-sim";

describe("ads pricing v3 margins", () => {
  it("uses a p90 API cost per credit in the expected band", () => {
    expect(P90_PER_CREDIT).toBeGreaterThan(0.4);
    expect(P90_PER_CREDIT).toBeLessThan(0.7);
  });

  it.each(ADS_PLANS.map((p) => [p.name, p.priceCents, p.monthlyCredits] as const))("plan %s keeps >= 70%% margin at p90 API cost", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
  });

  it.each(ADS_TOPUPS.map((t) => [t.name, t.priceCents, t.credits] as const))("top-up %s keeps >= 70%% margin at p90 API cost", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
  });

  it("prices top-ups per credit above every plan and keeps Scale as the highest-priced anchor", () => {
    const planMax = Math.max(...ADS_PLANS.map((p) => p.priceCents / p.monthlyCredits));
    for (const t of ADS_TOPUPS) expect(t.priceCents / t.credits).toBeGreaterThan(planMax);
    // Scale is the self-serve anchor of the post-trial menu; Agency sits above it for multi-brand teams.
    const selfServe = ADS_PLANS.filter((p) => p.key !== "agency");
    expect(Math.max(...selfServe.map((p) => p.priceCents))).toBe(ADS_PLANS.find((p) => p.key === "scale")?.priceCents);
  });

  it("gives Agency the lowest price per credit of any plan", () => {
    const agency = ADS_PLANS.find((p) => p.key === "agency");
    expect(agency).toBeDefined();
    for (const p of ADS_PLANS) if (p !== agency && agency) expect(agency.priceCents / agency.monthlyCredits).toBeLessThan(p.priceCents / p.monthlyCredits);
  });

  // Annual prepay = 10 months for 12 months of credits: margin at p90 API cost drops to ~65% (>= 80% at p50).
  it.each(ADS_PLANS.map((p) => [p.name, annualPriceCents(p), annualCredits(p)] as const))("annual %s keeps >= 60%% margin at p90 API cost", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.6);
  });
});

describe("annual prepay and agency price ids", () => {
  const env = { STRIPE_ADS_AGENCY_PRICE_ID: "price_ag_m", STRIPE_ADS_AGENCY_ANNUAL_PRICE_ID: "price_ag_y", STRIPE_ADS_STARTER_ANNUAL_PRICE_ID: "price_st_y" };
  it("maps annual and monthly price ids to the plan and interval", async () => {
    const { intervalFromPriceId, planFromPriceId } = await import("../billing-config");
    expect(intervalFromPriceId("price_ag_m", env)).toBe("month");
    expect(intervalFromPriceId("price_ag_y", env)).toBe("year");
    expect(intervalFromPriceId("price_x", env)).toBeNull();
    expect(planFromPriceId("price_ag_y", env)?.key).toBe("agency");
    expect(planFromPriceId("price_st_y", env)?.key).toBe("starter");
  });
  it("prices annual at 10 months and grants 12 months of credits", () => {
    const starter = ADS_PLANS.find((p) => p.key === "starter");
    if (!starter) throw new Error("no starter");
    expect(annualPriceCents(starter)).toBe(49000);
    expect(annualCredits(starter)).toBe(240);
  });
});

describe("upgrade top-up", () => {
  it("adds the difference to the new plan's period credits, never negative", async () => {
    const { upgradeTopUpCredits } = await import("../credits");
    expect(upgradeTopUpCredits(255, 20)).toBe(235);
    expect(upgradeTopUpCredits(240, 20)).toBe(220);
    expect(upgradeTopUpCredits(20, 55)).toBe(0);
    expect(upgradeTopUpCredits(55, -3)).toBe(55);
  });
});

describe("unlock_pack tripwire", () => {
  it("is $9 for 3 credits, resolvable as a topup but not listed with the credit packs", async () => {
    const { getTopup, UNLOCK_PACK, unlockPackCouponId } = await import("../billing-config");
    expect(UNLOCK_PACK).toMatchObject({ key: "unlock_pack", priceCents: 900, credits: 3, priceEnv: "STRIPE_ADS_UNLOCK_PACK_PRICE_ID" });
    expect(getTopup("unlock_pack")).toBe(UNLOCK_PACK);
    expect(ADS_TOPUPS.some((t) => t.key === "unlock_pack")).toBe(false);
    expect(unlockPackCouponId({ STRIPE_ADS_UNLOCK_PACK_COUPON_ID: "c1" })).toBe("c1");
    expect(unlockPackCouponId({})).toBeNull();
  });
  it("keeps >= 70% margin at p90 API cost and costs more per credit than any plan", async () => {
    const { UNLOCK_PACK } = await import("../billing-config");
    expect(marginAt(UNLOCK_PACK.priceCents / 100, UNLOCK_PACK.credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
    const planMax = Math.max(...ADS_PLANS.map((p) => p.priceCents / p.monthlyCredits));
    expect(UNLOCK_PACK.priceCents / UNLOCK_PACK.credits).toBeGreaterThan(planMax);
  });
});

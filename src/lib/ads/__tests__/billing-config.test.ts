import { describe, expect, it } from "vitest";
import { ADS_PLANS, ADS_TOPUPS, annualCredits, annualPriceCents, WEEKLY_DROP_CREDIT_EQUIVALENTS_PER_MONTH } from "../billing-config";

// Per-credit plans; the unlimited plan has its own cost test below (no credit count to price).
const CREDIT_PLANS = ADS_PLANS.filter((p) => !p.unlimited);
import { marginAt, P90_PER_CREDIT } from "../../../../scripts/ads-pricing-sim";

describe("ads pricing v3 margins", () => {
  it("uses a p90 API cost per credit in the expected band", () => {
    expect(P90_PER_CREDIT).toBeGreaterThan(0.4);
    expect(P90_PER_CREDIT).toBeLessThan(0.7);
  });

  it.each(CREDIT_PLANS.map((p) => [p.name, p.priceCents, p.monthlyCredits] as const))("plan %s keeps >= 70%% margin at p90 API cost", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
  });

  it.each(ADS_TOPUPS.map((t) => [t.name, t.priceCents, t.credits] as const))("top-up %s keeps >= 70%% margin at p90 API cost", (_n, cents, credits) => {
    expect(marginAt(cents / 100, credits, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
  });

  it("prices top-ups per credit above every plan and keeps Scale as the highest-priced anchor", () => {
    const planMax = Math.max(...CREDIT_PLANS.map((p) => p.priceCents / p.monthlyCredits));
    for (const t of ADS_TOPUPS) expect(t.priceCents / t.credits).toBeGreaterThan(planMax);
    // Scale is the self-serve anchor of the post-trial menu; Agency sits above it for multi-brand teams.
    const selfServe = CREDIT_PLANS.filter((p) => p.key !== "agency");
    expect(Math.max(...selfServe.map((p) => p.priceCents))).toBe(ADS_PLANS.find((p) => p.key === "scale")?.priceCents);
  });

  // Agency went unlimited (2026-11-11): 10 brands, 3 at a time. It must stay the top plan, above Ad Department.
  it("prices Agency (unlimited, 10 brands) above the unlimited Ad Department", () => {
    const agency = ADS_PLANS.find((p) => p.key === "agency");
    const hero = ADS_PLANS.find((p) => p.key === "ad_department");
    expect(agency?.unlimited && hero?.unlimited).toBe(true);
    expect(agency!.priceCents).toBeGreaterThan(hero!.priceCents);
    expect((agency!.unlimitedBrands ?? 0) > (hero!.unlimitedBrands ?? 0)).toBe(true);
  });

  // Annual prepay = 10 months for 12 months of credits: margin at p90 API cost drops to ~65% (>= 80% at p50).
  it.each(CREDIT_PLANS.map((p) => [p.name, annualPriceCents(p), annualCredits(p)] as const))("annual %s keeps >= 60%% margin at p90 API cost", (_n, cents, credits) => {
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
    const planMax = Math.max(...CREDIT_PLANS.map((p) => p.priceCents / p.monthlyCredits));
    expect(UNLOCK_PACK.priceCents / UNLOCK_PACK.credits).toBeGreaterThan(planMax);
  });
});

// Ozzy Ad Department, Founding Unlimited ($197/mo): Ad Packs + Studio cost 0 credits, so the per-credit p90 test
// above can't apply. Cost basis: generation runs on the flat Codex subscription (image + LLM marginal cost ~0); only
// compute (CODEX_PER_CREDIT, Railway share) scales with use. Fair use (one run + one Studio turn in progress at a
// time) caps throughput. Budget: Weekly Drop (~43 credit-equivalents) + 100 more must keep >= 70% even at the p50 API
// list cost ($0.27/credit), and Weekly Drop + a heavy 300 must keep >= 90% on Codex compute.
describe("unlimited Ad Department cost basis", () => {
  it("keeps >= 70% margin for a heavy month at p50 API cost and >= 90% on the Codex subscription", async () => {
    const { CODEX_PER_CREDIT } = await import("../../../../scripts/ads-pricing-sim");
    const hero = ADS_PLANS.find((p) => p.key === "ad_department");
    if (!hero) throw new Error("no ad_department");
    expect(hero.unlimited).toBe(true);
    expect(hero.monthlyCredits).toBe(0);
    const heavy = WEEKLY_DROP_CREDIT_EQUIVALENTS_PER_MONTH + 300;
    expect(marginAt(hero.priceCents / 100, 100 + WEEKLY_DROP_CREDIT_EQUIVALENTS_PER_MONTH, 0.27)).toBeGreaterThanOrEqual(0.7);
    expect(marginAt(hero.priceCents / 100, heavy, CODEX_PER_CREDIT)).toBeGreaterThanOrEqual(0.9);
  });
});

import { brandAllowed, concurrentLimit, FOUNDING_TERMS, hasAdDepartment, isUnlimitedPlan, unlimitedBrandLimit, unlimitedLine } from "@/lib/ads/billing-config";

describe("unlimited plans: Ad Department (1 business) vs Agency (10 brands, 3 at a time)", () => {
  const ws = (adsPlan: string, subscriptionStatus = "active") => ({ adsPlan, subscriptionStatus });
  it("Agency is unlimited, gets Ad Department features, 10 brands, 3 at a time", () => {
    expect(isUnlimitedPlan(ws("agency"))).toBe(true);
    expect(hasAdDepartment(ws("agency"))).toBe(true);
    expect(unlimitedBrandLimit(ws("agency"))).toBe(10);
    expect(concurrentLimit(ws("agency"))).toBe(3);
  });
  it("Ad Department covers 1 business, one at a time; credit plans have no brand cap", () => {
    expect(unlimitedBrandLimit(ws("ad_department"))).toBe(1);
    expect(concurrentLimit(ws("ad_department"))).toBe(1);
    expect(unlimitedBrandLimit(ws("starter"))).toBeNull();
    expect(unlimitedBrandLimit(ws("ad_department", "canceled"))).toBeNull();
  });
  it("brand rule: same business always ok; a new one only under the cap", () => {
    expect(brandAllowed("acme.com", [], 1)).toBe(true);
    expect(brandAllowed("acme.com", ["acme.com"], 1)).toBe(true);
    expect(brandAllowed("other.com", ["acme.com"], 1)).toBe(false);
    expect(brandAllowed("b10.com", Array.from({ length: 9 }, (_, i) => `b${i}.com`), 10)).toBe(true);
    expect(brandAllowed("b11.com", Array.from({ length: 10 }, (_, i) => `b${i}.com`), 10)).toBe(false);
    expect(brandAllowed("x.com", ["a.com", "b.com"], null)).toBe(true);
  });
  it("plain copy for each plan, and the founding promise is 3 months", () => {
    expect(unlimitedLine({ unlimited: true, unlimitedBrands: 1, concurrent: 1 })).toBe("Unlimited ads and Studio videos for your business, made one at a time");
    expect(unlimitedLine({ unlimited: true, unlimitedBrands: 10, concurrent: 3 })).toBe("Unlimited ads and Studio videos for up to 10 brands, 3 at a time");
    expect(unlimitedLine({ unlimited: false })).toBeNull();
    expect(FOUNDING_TERMS).toContain("first 3 months");
    expect(FOUNDING_TERMS).not.toMatch(/6 months/);
  });
});

describe("admin parallel Studio chats", () => {
  it("admins get many at once, everyone else keeps the plan limit", async () => {
    const { concurrentLimit, ADMIN_CONCURRENT } = await import("../billing-config");
    const w = { adsPlan: "ad_department" } as Parameters<typeof concurrentLimit>[0];
    expect(concurrentLimit(w, { isAdmin: true })).toBe(ADMIN_CONCURRENT);
    expect(concurrentLimit(w, { isAdmin: false })).toBe(1);
    expect(concurrentLimit(w, null)).toBe(1);
  });
});

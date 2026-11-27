import { describe, expect, it } from "vitest";
import { BFCM_ANNUAL_BONUS_CREDITS, BFCM_ENDS_AT, BFCM_UNLOCK_BONUS_CREDITS, bfcmAnnualBonusFor, bfcmAnnualViews, bfcmRemainingMs, formatBfcmLeft, isBfcmActive, topupCreditsFor } from "@/lib/ads/bfcm";
import { annualCredits, BFCM_ANNUAL_PRICES, bfcmAnnualFor, getPlan, intervalFromPriceId, planFromPriceId, UNLOCK_PACK, getTopup } from "@/lib/ads/billing-config";
import { knownPrices } from "@/lib/offer-intel/coherence";

describe("BFCM deadline (Mon 30 Nov 2026 23:59:59 America/Los_Angeles)", () => {
  it("is open on Black Friday and until the last second of Cyber Monday, closed one second later", () => {
    expect(isBfcmActive(new Date("2026-11-28T17:00:00Z"))).toBe(true);
    // 23:59:59 PST on Mon 30 Nov = 07:59:59Z on 1 Dec
    expect(isBfcmActive(new Date("2026-12-01T07:59:59Z"))).toBe(true);
    expect(isBfcmActive(new Date("2026-12-01T08:00:00Z"))).toBe(false);
    expect(isBfcmActive(new Date("2026-12-10T00:00:00Z"))).toBe(false);
  });
  it("matches the Pacific wall clock (PST, not PDT)", () => {
    const pt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "full", timeStyle: "long" }).format(BFCM_ENDS_AT);
    expect(pt).toMatch(/Monday, November 30, 2026 at 11:59:59 PM PST/);
  });
  it("counts down to a fixed instant: same answer for every visitor, 0 after", () => {
    const now = new Date("2026-11-30T07:59:59Z");
    expect(bfcmRemainingMs(now)).toBe(24 * 3_600_000);
    expect(bfcmRemainingMs(new Date("2026-12-03T00:00:00Z"))).toBe(0);
    expect(formatBfcmLeft(24 * 3_600_000)).toBe("1d 00h left");
    expect(formatBfcmLeft(0)).toBe("");
  });
});

describe("BFCM prices and plan mapping", () => {
  const env = { STRIPE_ADS_BFCM_AD_DEPARTMENT_ANNUAL_PRICE_ID: "price_bf_dept", STRIPE_ADS_BFCM_AUTOPILOT_ANNUAL_PRICE_ID: "price_bf_auto", STRIPE_ADS_AD_DEPARTMENT_PRICE_ID: "price_dept_m" };
  it("prices: Ad Department $1,497/yr (vs $2,364), Growth Autopilot $2,497/yr (vs $3,564)", () => {
    expect(bfcmAnnualFor("ad_department")?.priceCents).toBe(149700);
    expect(bfcmAnnualFor("autopilot")?.priceCents).toBe(249700);
    expect(bfcmAnnualFor("starter")).toBeUndefined();
    const v = Object.fromEntries(bfcmAnnualViews().map((x) => [x.plan, x]));
    expect(v.ad_department).toMatchObject({ price: "$1,497", twelveMonthly: "$2,364", saving: "$867" });
    expect(v.autopilot).toMatchObject({ price: "$2,497", twelveMonthly: "$3,564", saving: "$1,067" });
  });
  it("a BFCM price id maps to its plan, billed yearly (webhook grants 12 months of credits)", () => {
    expect(planFromPriceId("price_bf_dept", env)?.key).toBe("ad_department");
    expect(planFromPriceId("price_bf_auto", env)?.key).toBe("autopilot");
    expect(intervalFromPriceId("price_bf_auto", env)).toBe("year");
    expect(intervalFromPriceId("price_dept_m", env)).toBe("month");
    expect(planFromPriceId("price_unknown", env)).toBeUndefined();
    expect(annualCredits(getPlan("autopilot")!)).toBe(1200 * 12);
  });
  it("copy-coherence checker knows the BFCM figures", () => {
    const k = knownPrices();
    for (const b of BFCM_ANNUAL_PRICES) expect(k.has(`$${(b.priceCents / 100).toLocaleString("en-US")}`)).toBe(true);
    expect(k.has("$2,364")).toBe(true);
    expect(k.has("$3,564")).toBe(true);
  });
  it("bonuses: +7 credits on a BFCM $9 unlock only; annual bonus only on the first paid BFCM yearly invoice", () => {
    expect(topupCreditsFor(UNLOCK_PACK, { promo: "bfcm" })).toBe(UNLOCK_PACK.credits + BFCM_UNLOCK_BONUS_CREDITS);
    expect(topupCreditsFor(UNLOCK_PACK, {})).toBe(UNLOCK_PACK.credits);
    expect(topupCreditsFor(getTopup("topup_10")!, { promo: "bfcm" })).toBe(10);
    expect(bfcmAnnualBonusFor({ promo: "bfcm" }, "subscription_create", true, 249700)).toBe(BFCM_ANNUAL_BONUS_CREDITS);
    expect(bfcmAnnualBonusFor({ promo: "bfcm" }, "subscription_cycle", true, 249700)).toBe(0);
    expect(bfcmAnnualBonusFor({ promo: "bfcm" }, "subscription_create", false, 9700)).toBe(0);
    expect(bfcmAnnualBonusFor({}, "subscription_create", true, 249700)).toBe(0);
    expect(bfcmAnnualBonusFor({ promo: "bfcm" }, "subscription_create", true, 0)).toBe(0);
  });
});

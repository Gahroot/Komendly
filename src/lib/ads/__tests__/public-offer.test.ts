import { describe, expect, it } from "vitest";
import { AD_DEPARTMENT_PRICE_CENTS, LAUNCH_FIRST_MONTH_OFF_CENTS } from "@/lib/ads/billing-config";
import { AD_SPEND_LINE, checkoutTerms, FREE_PACK_LINE, HERO_INCLUDES, HERO_OUTCOME, HERO_PLAN, HERO_PRICE_LINE, HERO_TEAM, PUBLIC_OFFER, UNLOCK_LINE } from "@/lib/ads/public-offer";

describe("public offer facts", () => {
  it("leads with Ozzy's AI Marketing Team (the ad_department plan) and its first-month price, from billing-config", () => {
    expect(HERO_PLAN.key).toBe("ad_department");
    expect(PUBLIC_OFFER.heroName).toBe("Ozzy's AI Marketing Team");
    expect(PUBLIC_OFFER.heroPrice).toBe(`$${AD_DEPARTMENT_PRICE_CENTS / 100}`);
    expect(PUBLIC_OFFER.heroFirstMonth).toBe(`$${(AD_DEPARTMENT_PRICE_CENTS - LAUNCH_FIRST_MONTH_OFF_CENTS) / 100}`);
    expect(HERO_PRICE_LINE).toBe("Ozzy's AI Marketing Team: $97 the first month, then $197/month");
  });
  it("states the free pack and the unlock", () => {
    expect(FREE_PACK_LINE).toMatch(/^10 free ads from your website, no card needed \(20 /);
    expect(UNLOCK_LINE).toContain('$9 "Unlock this pack"');
  });
  it("checkout terms state price, renewal, cancel path and ad spend", () => {
    expect(checkoutTerms(HERO_PLAN, { firstPaymentCents: 9700 })).toBe("$97 today, then $197/month, renews monthly. Cancel anytime online. Ad spend is paid to Meta separately.");
    expect(checkoutTerms(HERO_PLAN)).toBe("$197/month, renews monthly. Cancel anytime online. Ad spend is paid to Meta separately.");
    expect(checkoutTerms(HERO_PLAN, { yearly: true })).toBe("$1,970/year, renews yearly. Cancel anytime online. Ad spend is paid to Meta separately.");
  });
  it("never promises results and keeps ad spend separate", () => {
    const copy = [HERO_OUTCOME, HERO_INCLUDES, ...HERO_TEAM.map((t) => t.does)].join(" ");
    expect(copy).not.toMatch(/guarantee|\bROI\b|\d+\s*(leads|customers|sales)/i);
    expect(AD_SPEND_LINE).toMatch(/directly to Meta/);
    expect(HERO_TEAM.map((t) => t.role)).toEqual(["Ozzy, Marketing Director", "Research & Strategy", "Creative Studio", "Launch & Budget Desk", "Performance Analyst", "Lead Desk"]);
  });
});

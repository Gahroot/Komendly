import { describe, expect, it } from "vitest";
import { AD_DEPARTMENT_PRICE_CENTS, LAUNCH_FIRST_MONTH_OFF_CENTS } from "@/lib/ads/billing-config";
import { FREE_PACK_LINE, HERO_PLAN, HERO_PRICE_LINE, PUBLIC_OFFER, UNLOCK_LINE } from "@/lib/ads/public-offer";

describe("public offer facts", () => {
  it("leads with Ozzy Ad Department and its first-month price, from billing-config", () => {
    expect(HERO_PLAN.key).toBe("ad_department");
    expect(PUBLIC_OFFER.heroPrice).toBe(`$${AD_DEPARTMENT_PRICE_CENTS / 100}`);
    expect(PUBLIC_OFFER.heroFirstMonth).toBe(`$${(AD_DEPARTMENT_PRICE_CENTS - LAUNCH_FIRST_MONTH_OFF_CENTS) / 100}`);
    expect(HERO_PRICE_LINE).toBe("Ozzy Ad Department: $97 the first month, then $197/month");
  });
  it("states the free pack and the unlock", () => {
    expect(FREE_PACK_LINE).toMatch(/^3 free ads from your website, no card needed \(20 /);
    expect(UNLOCK_LINE).toContain('$9 "Unlock this pack"');
  });
});

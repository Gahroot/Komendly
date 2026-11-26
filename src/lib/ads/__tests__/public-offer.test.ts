import { describe, expect, it } from "vitest";
import { AD_DEPARTMENT_PRICE_CENTS, AUTOPILOT_PRICE_CENTS, AUTOPILOT_REGULAR_PRICE_CENTS, LAUNCH_FIRST_MONTH_OFF_CENTS } from "@/lib/ads/billing-config";
import { AD_SPEND_LINE, checkoutTerms, DIY_INCLUDES, DIY_PLAN, DIY_PRICE_LINE, FOUNDING_SPOTS_LINE, FREE_PACK_LINE, HERO_INCLUDES, HERO_OUTCOME, HERO_PLAN, HERO_PRICE_LINE, HERO_TEAM, OWNER_STEPS, PUBLIC_OFFER, UNLOCK_LINE } from "@/lib/ads/public-offer";

describe("public offer facts", () => {
  it("leads with Ozzy's AI Marketing Team (Growth Autopilot) at the founding price, from billing-config", () => {
    expect(HERO_PLAN.key).toBe("autopilot");
    expect(PUBLIC_OFFER.heroName).toBe("Ozzy's AI Marketing Team");
    expect(PUBLIC_OFFER.heroPlanName).toBe("Growth Autopilot");
    expect(PUBLIC_OFFER.heroPrice).toBe(`$${AUTOPILOT_PRICE_CENTS / 100}`);
    expect(PUBLIC_OFFER.heroRegularPrice).toBe(`$${AUTOPILOT_REGULAR_PRICE_CENTS / 100}`);
    expect(HERO_PRICE_LINE).toBe("Ozzy's AI Marketing Team (Growth Autopilot): $297/month founding price, locked for as long as you stay subscribed (regular price $497/month)");
    expect(FOUNDING_SPOTS_LINE).toBe("Founding spots: 10 businesses. We set up your Meta connection with you when you join.");
  });
  it("sells Ozzy Ad Department as the do-it-yourself plan with its first-month price", () => {
    expect(DIY_PLAN.key).toBe("ad_department");
    expect(PUBLIC_OFFER.diyPrice).toBe(`$${AD_DEPARTMENT_PRICE_CENTS / 100}`);
    expect(PUBLIC_OFFER.diyFirstMonth).toBe(`$${(AD_DEPARTMENT_PRICE_CENTS - LAUNCH_FIRST_MONTH_OFF_CENTS) / 100}`);
    expect(DIY_PRICE_LINE).toBe("Ozzy Ad Department: $97 the first month, then $197/month");
    expect([DIY_INCLUDES, ...DIY_PLAN.highlights].join(" ")).not.toMatch(/launch|run (them|your)|for you as|lead ads/i);
  });
  it("states the free pack and the unlock", () => {
    expect(FREE_PACK_LINE).toMatch(/^10 free ads from your website, no card needed \(20 /);
    expect(UNLOCK_LINE).toContain('$9 "Unlock this pack"');
  });
  it("checkout terms state price, renewal, cancel path and ad spend", () => {
    expect(checkoutTerms(HERO_PLAN)).toBe("$297/month, renews monthly. Cancel anytime online. Ad spend is paid to Meta separately.");
    expect(checkoutTerms(DIY_PLAN, { firstPaymentCents: 9700 })).toBe("$97 today, then $197/month, renews monthly. Cancel anytime online. Ad spend is paid to Meta separately.");
    expect(checkoutTerms(DIY_PLAN, { yearly: true })).toBe("$1,970/year, renews yearly. Cancel anytime online. Ad spend is paid to Meta separately.");
  });
  it("never promises results, never claims self-serve Meta connect, keeps ad spend separate", () => {
    const copy = [HERO_OUTCOME, HERO_INCLUDES, ...HERO_TEAM.map((t) => t.does)].join(" ");
    expect(copy).not.toMatch(/guarantee|\bROI\b|\d+\s*(leads|customers|sales)/i);
    expect([...OWNER_STEPS, ...HERO_PLAN.highlights].join(" ")).not.toMatch(/one[- ]click connect|couple of clicks|connect meta once/i);
    expect(AD_SPEND_LINE).toMatch(/directly to Meta/);
    expect(HERO_TEAM.map((t) => t.role)).toEqual(["Ozzy, your point of contact", "Learns your business", "Makes your ads", "Puts them live, inside your limit", "Pauses what wastes money", "Sends you the leads"]);
  });
});

describe("Growth Autopilot first month + step-down", () => {
  it("exports the exact first-month facts", async () => {
    const m = await import("@/lib/ads/public-offer");
    expect(m.AUTOPILOT_FIRST_MONTH_CENTS).toBe(9700);
    expect(m.AUTOPILOT_FIRST_MONTH_LINE).toBe("$97 your first month, then $297/month");
  });
  it("guarantee is about our work, never results, and starts when Meta is connected", async () => {
    const { AUTOPILOT_GUARANTEE_LINE: g } = await import("@/lib/ads/public-offer");
    expect(g).toMatch(/within 7 days of you connecting Meta/);
    expect(g).toMatch(/30-day full refund/);
    expect(g).toMatch(/can't promise leads or sales/);
  });
  it("DIY step-down is a different product shown only after 'not now', same price as today", async () => {
    const { DIY_STEP_DOWN } = await import("@/lib/ads/public-offer");
    expect(DIY_STEP_DOWN.shownAfter).toBe("autopilot_not_now");
    expect(DIY_STEP_DOWN.priceLine).toBe(DIY_PRICE_LINE);
    expect(DIY_STEP_DOWN.terms).toMatch(/post them yourself/);
  });
});

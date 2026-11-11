import { describe, expect, it } from "vitest";
import { checkFirstVideoEligibility, hasTestimonialAccess, FIRST_VIDEO_OFFER } from "../first-video-offer";

const fresh = { plan: "pending", subscriptionStatus: "incomplete", stripeSubscriptionId: null, purchaseCount: 0 };

describe("first video offer eligibility", () => {
  it("is the $97 Launch Kit for 3 videos", () => {
    expect(FIRST_VIDEO_OFFER.priceCents).toBe(9700);
    expect(FIRST_VIDEO_OFFER.minutes).toBe(3);
  });
  it("allows a brand-new user", () => {
    expect(checkFirstVideoEligibility(fresh)).toEqual({ eligible: true });
    expect(checkFirstVideoEligibility({ ...fresh, plan: "free" })).toEqual({ eligible: true });
  });
  it("blocks active or trialing subscribers", () => {
    expect(checkFirstVideoEligibility({ ...fresh, plan: "pro", subscriptionStatus: "active" })).toEqual({ eligible: false, reason: "has_subscription" });
    expect(checkFirstVideoEligibility({ ...fresh, subscriptionStatus: "trialing" })).toEqual({ eligible: false, reason: "has_subscription" });
  });
  it("blocks users with a paid plan or a subscription id even if past due", () => {
    expect(checkFirstVideoEligibility({ ...fresh, plan: "starter", subscriptionStatus: "past_due" }).eligible).toBe(false);
    expect(checkFirstVideoEligibility({ ...fresh, stripeSubscriptionId: "sub_1" }).eligible).toBe(false);
  });
  it("blocks anyone with a prior one-time purchase", () => {
    expect(checkFirstVideoEligibility({ ...fresh, purchaseCount: 1 })).toEqual({ eligible: false, reason: "already_purchased" });
  });
});

describe("testimonial dashboard access", () => {
  it("lets first-video buyers in without a subscription", () => {
    expect(hasTestimonialAccess({ plan: "pending", subscriptionStatus: "incomplete", bonusMinutes: 1 })).toBe(true);
  });
  it("lets subscribers in and keeps unpaid users out", () => {
    expect(hasTestimonialAccess({ plan: "pro", subscriptionStatus: "active", bonusMinutes: 0 })).toBe(true);
    expect(hasTestimonialAccess({ plan: "pending", subscriptionStatus: "incomplete", bonusMinutes: 0 })).toBe(false);
    expect(hasTestimonialAccess({ plan: "pending", subscriptionStatus: "active", bonusMinutes: 0 })).toBe(false);
  });
});

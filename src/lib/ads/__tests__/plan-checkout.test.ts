import { describe, expect, it } from "vitest";
import { autoCheckoutPlan, planCheckoutPath, signedOutBillingRedirect } from "../plan-checkout";

describe("plan checkout handoff", () => {
  it("keeps the picked plan and interval in the billing link", () => {
    expect(planCheckoutPath("ad_department", false)).toBe("/ads/billing?plan=ad_department");
    expect(planCheckoutPath("starter", true)).toBe("/ads/billing?plan=starter&billing=year");
  });

  it("sends signed-out plan pickers to sign-up with the plan kept, others to sign-in", () => {
    expect(signedOutBillingRedirect("ad_department", false)).toBe(`/ads/signup?next=${encodeURIComponent("/ads/billing?plan=ad_department")}`);
    expect(signedOutBillingRedirect(undefined, false)).toBe("/ads/login?next=%2Fads%2Fbilling");
    expect(signedOutBillingRedirect("not_a_plan", true)).toBe(`/ads/login?next=${encodeURIComponent("/ads/billing?billing=year")}`);
  });

  it("auto-opens checkout only for a new buyer on a plan for sale", () => {
    const base = { plan: "ad_department", paid: false, suspended: false, configured: true };
    expect(autoCheckoutPlan(base)).toBe("ad_department");
    expect(autoCheckoutPlan({ ...base, paid: true })).toBeNull();
    expect(autoCheckoutPlan({ ...base, checkout: "canceled" })).toBeNull();
    expect(autoCheckoutPlan({ ...base, suspended: true })).toBeNull();
    expect(autoCheckoutPlan({ ...base, configured: false })).toBeNull();
    expect(autoCheckoutPlan({ ...base, plan: "growth" })).toBeNull();
    expect(autoCheckoutPlan({ ...base, plan: undefined })).toBeNull();
  });
});

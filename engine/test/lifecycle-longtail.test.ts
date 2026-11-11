import { describe, expect, it } from "vitest";
import { verifyEmailToken } from "../../src/lib/ads/lifecycle/tokens";
import { attemptCap } from "../src/jobs/replace";
import { giftPolicy, isFreeRun, NURTURE_COST_CAP_MICROS, nurtureFirstTryMicros, nurtureOverBudget } from "../src/jobs/gift-policy";
import { maxTypeAds, withinFillWindow } from "../src/jobs/trial-fill";
import { trackedLink } from "../src/lifecycle/send";

describe("click tracking fallback", () => {
  const base = "https://www.komendly.com";
  it("emits plain destination URLs unless LIFECYCLE_CLICK_TRACKING=1", () => {
    for (const env of [{}, { LIFECYCLE_CLICK_TRACKING: "0" }, { LIFECYCLE_CLICK_TRACKING: "true" }]) {
      const u = trackedLink(base, "s", "u1", "day10_free_ads", "/ads/refer", env);
      expect(u).toBe(`${base}/ads/refer?utm_source=email&utm_medium=lifecycle&utm_campaign=day10_free_ads`);
      expect(u).not.toContain("email-click");
    }
  });
  it("emits a signed /api/ads/email-click link when enabled", () => {
    const u = trackedLink(base, "s", "u1", "day10_free_ads", "/r/jane-k3x9", { LIFECYCLE_CLICK_TRACKING: "1" });
    const token = u.split("/api/ads/email-click/")[1] ?? "";
    expect(verifyEmailToken(token, "s")).toMatchObject({ p: "click", u: "u1", k: "day10_free_ads", l: "/r/jane-k3x9?utm_source=email&utm_medium=lifecycle&utm_campaign=day10_free_ads" });
  });
});

describe("nurture run policy", () => {
  const run = { kind: "nurture", isTrial: false, staticCount: 1, motionCount: 0 };
  it("is a free run: no credits, claim, motion or bonus; 1 type ad max; 3 attempts", () => {
    expect(isFreeRun(run)).toBe(true);
    const p = giftPolicy(run);
    expect([p.autoConfirm, p.claimTrial, p.credits, p.bonus, p.motionCount(1)]).toEqual([true, false, false, false, 0]);
    expect(attemptCap("static", run)).toBe(3);
    expect(attemptCap("motion", run)).toBe(0);
    expect(maxTypeAds(run)).toBe(1);
    expect(withinFillWindow({ ...run, confirmedAt: new Date(0) }, new Date(11 * 60_000))).toBe(false);
  });
  it("stays under the ~$0.60 cost cap", () => {
    expect(nurtureFirstTryMicros()).toBeLessThanOrEqual(NURTURE_COST_CAP_MICROS);
    expect(nurtureOverBudget(0)).toBe(false);
    expect(nurtureOverBudget(400_000)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { FREE_TRIAL_ADS, isReplacedAd, trialLockedAdIds } from "../bonus-access";

const ad = (index: number, status = "ready", extra: Record<string, unknown> = {}) => ({ id: `a${index}`, index, status, visualBrief: {}, ...extra });

describe("free pack limit", () => {
  it("keeps the whole 10-ad trial pack free and locks main ads past it", () => {
    expect(FREE_TRIAL_ADS).toBe(10);
    expect(trialLockedAdIds({ isTrial: true }, Array.from({ length: 10 }, (_, i) => ad(i)), false).size).toBe(0);
    const ads = Array.from({ length: 12 }, (_, i) => ad(i));
    expect([...trialLockedAdIds({ isTrial: true }, ads, false)].sort()).toEqual(["a10", "a11"]);
  });
  it("locks nothing once unlocked, or on a non-trial run", () => {
    const ads = Array.from({ length: 10 }, (_, i) => ad(i));
    expect(trialLockedAdIds({ isTrial: true }, ads, true).size).toBe(0);
    expect(trialLockedAdIds({ isTrial: false }, ads, false).size).toBe(0);
  });
  it("failed, replaced and bonus ads don't use a free slot", () => {
    const ads = [ad(0, "failed_qc"), ad(1, "ready", { qcReport: { replacedBy: "x" } }), ad(2), ad(3, "rendering"), ad(4), ad(5), ad(6, "ready", { visualBrief: { locked: true, bonusKind: "story" } })];
    expect([...trialLockedAdIds({ isTrial: true }, ads, false, 3)]).toEqual(["a5"]);
  });
  it("isReplacedAd", () => {
    expect(isReplacedAd({ replacementPending: true })).toBe(true);
    expect(isReplacedAd(null)).toBe(false);
  });
});

describe("referred free pack", () => {
  it("referred friends keep all 20 ads free; everyone else gets 10", async () => {
    const { freeTrialAdsFor, REFERRED_FREE_TRIAL_ADS } = await import("../bonus-access");
    const { REFERRED_TRIAL_STATIC } = await import("../referrals");
    expect(REFERRED_FREE_TRIAL_ADS).toBe(REFERRED_TRIAL_STATIC);
    expect(freeTrialAdsFor(true)).toBe(20);
    expect(freeTrialAdsFor(false)).toBe(10);
    const ads = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, index: i, status: "ready", visualBrief: {} }));
    expect(trialLockedAdIds({ isTrial: true }, ads, false, freeTrialAdsFor(true)).size).toBe(0);
  });
});

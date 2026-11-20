import { describe, expect, it } from "vitest";
import { FREE_TRIAL_ADS, isReplacedAd, trialLockedAdIds } from "../bonus-access";

const ad = (index: number, status = "ready", extra: Record<string, unknown> = {}) => ({ id: `a${index}`, index, status, visualBrief: {}, ...extra });

describe("free pack limit", () => {
  it("locks every main trial ad after the first 3", () => {
    const ads = Array.from({ length: 10 }, (_, i) => ad(i));
    expect(FREE_TRIAL_ADS).toBe(3);
    expect([...trialLockedAdIds({ isTrial: true }, ads, false)].sort()).toEqual(["a3", "a4", "a5", "a6", "a7", "a8", "a9"]);
  });
  it("locks nothing once unlocked, or on a non-trial run", () => {
    const ads = Array.from({ length: 10 }, (_, i) => ad(i));
    expect(trialLockedAdIds({ isTrial: true }, ads, true).size).toBe(0);
    expect(trialLockedAdIds({ isTrial: false }, ads, false).size).toBe(0);
  });
  it("failed, replaced and bonus ads don't use a free slot", () => {
    const ads = [ad(0, "failed_qc"), ad(1, "ready", { qcReport: { replacedBy: "x" } }), ad(2), ad(3, "rendering"), ad(4), ad(5), ad(6, "ready", { visualBrief: { locked: true, bonusKind: "story" } })];
    expect([...trialLockedAdIds({ isTrial: true }, ads, false)]).toEqual(["a5"]);
  });
  it("isReplacedAd", () => {
    expect(isReplacedAd({ replacementPending: true })).toBe(true);
    expect(isReplacedAd(null)).toBe(false);
  });
});

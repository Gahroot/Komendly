import { describe, expect, it } from "vitest";
import { bonusLabel, canServeAsset, exportableAssets, hasBonusAccess, isAdLocked, parseBonus, shouldAwaitBonus, summarizeBonus } from "../bonus-access";
import { formatCountdown, launchQuarterValueStack, offerPerAdCents } from "../offer-value";

const story = { locked: true, bonusKind: "story" };
const motion = { locked: true, bonusKind: "motion" };

describe("parseBonus", () => {
  it("only treats locked === true as bonus", () => {
    expect(parseBonus(story)).toEqual({ bonusKind: "story" });
    expect(parseBonus(motion)).toEqual({ bonusKind: "motion" });
    expect(parseBonus({ locked: "true", bonusKind: "story" })).toBeNull();
    expect(parseBonus({ layout: "x" })).toBeNull();
    expect(parseBonus(null)).toBeNull();
  });
});

describe("hasBonusAccess", () => {
  it("unlocks for paid plans or purchased credits, never when suspended", () => {
    expect(hasBonusAccess({ isPaid: true, hasPurchasedCredits: false })).toBe(true);
    expect(hasBonusAccess({ isPaid: false, hasPurchasedCredits: true })).toBe(true);
    expect(hasBonusAccess({ isPaid: false, hasPurchasedCredits: false })).toBe(false);
    expect(hasBonusAccess({ isPaid: true, hasPurchasedCredits: true, suspended: true })).toBe(false);
  });
});

describe("canServeAsset", () => {
  it("serves only the preview poster of a locked ad, and never as a download", () => {
    expect(canServeAsset({ visualBrief: story, assetRatio: "preview", unlocked: false, use: "preview" })).toBe(true);
    expect(canServeAsset({ visualBrief: story, assetRatio: "9:16", unlocked: false, use: "preview" })).toBe(false);
    expect(canServeAsset({ visualBrief: story, assetRatio: "9:16", unlocked: false, use: "download" })).toBe(false);
    expect(canServeAsset({ visualBrief: story, assetRatio: "preview", unlocked: false, use: "download" })).toBe(false);
  });
  it("serves everything once unlocked and for normal ads", () => {
    expect(canServeAsset({ visualBrief: story, assetRatio: "9:16", unlocked: true, use: "download" })).toBe(true);
    expect(canServeAsset({ visualBrief: null, assetRatio: "4:5", unlocked: false, use: "download" })).toBe(true);
    expect(isAdLocked(motion, true)).toBe(false);
  });
});

describe("exportableAssets", () => {
  const assets = [{ ratio: "9:16" }, { ratio: "preview" }];
  it("drops locked ads and preview posters", () => {
    expect(exportableAssets({ visualBrief: story, assets }, false)).toEqual([]);
    expect(exportableAssets({ visualBrief: story, assets }, true)).toEqual([{ ratio: "9:16" }]);
    expect(exportableAssets({ visualBrief: {}, assets: [{ ratio: "4:5" }] }, false)).toEqual([{ ratio: "4:5" }]);
  });
});

describe("summarizeBonus / bonusLabel", () => {
  it("counts ready bonus ads and is null without any", () => {
    const ads = [
      { visualBrief: story, status: "ready" }, { visualBrief: story, status: "ready" }, { visualBrief: story, status: "ready" },
      { visualBrief: motion, status: "ready" }, { visualBrief: motion, status: "ready" }, { visualBrief: motion, status: "rendering" },
      { visualBrief: null, status: "ready" },
    ];
    const s = summarizeBonus(ads, false);
    expect(s).toEqual({ stories: 3, videos: 2, locked: true });
    expect(s && bonusLabel(s)).toBe("3 Stories versions + 2 more videos");
    expect(bonusLabel({ stories: 1, videos: 0 })).toBe("1 Stories version");
    expect(summarizeBonus([{ visualBrief: null, status: "ready" }], false)).toBeNull();
    expect(summarizeBonus(ads, true)?.locked).toBe(false);
  });
});

describe("shouldAwaitBonus", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const base = { enabled: true, isTrial: true, completedAt: new Date("2026-11-09T11:55:00Z"), bonusReadyLogged: false, pendingBonusAds: 0, now };
  it("polls shortly after completion until bonus_ready", () => {
    expect(shouldAwaitBonus(base)).toBe(true);
    expect(shouldAwaitBonus({ ...base, bonusReadyLogged: true })).toBe(false);
    expect(shouldAwaitBonus({ ...base, completedAt: new Date("2026-11-09T10:00:00Z") })).toBe(false);
    expect(shouldAwaitBonus({ ...base, bonusReadyLogged: true, pendingBonusAds: 2 })).toBe(true);
  });
  it("never polls when the flag is off or not a trial", () => {
    expect(shouldAwaitBonus({ ...base, enabled: false, pendingBonusAds: 3 })).toBe(false);
    expect(shouldAwaitBonus({ ...base, isTrial: false })).toBe(false);
  });
});

describe("offer value stack", () => {
  it("uses real billing-config numbers", () => {
    // Unlimited hero plan: no per-ad price; the stack lists stated values and the first-month price.
    expect(offerPerAdCents()).toEqual({ offer: 0, plan: 0 });
    const lines = launchQuarterValueStack({ stories: 3, videos: 2, locked: true });
    expect(lines[0]).toContain("Unlimited ads + Ozzy Studio videos");
    expect(lines.some((l) => l.includes("Weekly Drop"))).toBe(true);
    expect(lines.find((l) => l.startsWith("Total value"))).toContain("Your first month: $97 (save $100), then $197/month");
    expect(lines).toContain("Unlocks your 3 Stories versions + 2 more videos right away");
    expect(launchQuarterValueStack(null).some((l) => l.startsWith("Unlocks"))).toBe(false);
  });
  it("formats the countdown", () => {
    expect(formatCountdown(0)).toBe("");
    expect(formatCountdown((71 * 3600 + 12 * 60 + 5) * 1000)).toBe("71h 12m");
    expect(formatCountdown(125_000)).toBe("2m 05s");
  });
});

describe("shouldShowOfferModal", () => {
  it("shows once per run and caps per session", async () => {
    const { shouldShowOfferModal } = await import("../offer-value");
    expect(shouldShowOfferModal({ shownForRun: false, shownThisSession: 0, offerOpen: true })).toBe(true);
    expect(shouldShowOfferModal({ shownForRun: true, shownThisSession: 0, offerOpen: true })).toBe(false);
    expect(shouldShowOfferModal({ shownForRun: false, shownThisSession: 1, offerOpen: true })).toBe(false);
    expect(shouldShowOfferModal({ shownForRun: false, shownThisSession: 0, offerOpen: false })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { arbitrateStudioOffer, bridgePrompt, bridgeVisible, pickBridgeAd, pickBridgeAsset } from "../bridge";

describe("arbitrateStudioOffer", () => {
  it("Launch Quarter wins while its window is open", () => {
    expect(arbitrateStudioOffer({ paid: false, launchQuarterOpen: true, studioLaunchOpen: true })).toBe("launch_quarter");
    expect(arbitrateStudioOffer({ paid: false, launchQuarterOpen: true, studioLaunchOpen: false })).toBe("launch_quarter");
  });
  it("Studio launch shows after the LQ window closes", () => {
    expect(arbitrateStudioOffer({ paid: false, launchQuarterOpen: false, studioLaunchOpen: true })).toBe("studio_launch");
  });
  it("no offer when nothing is open, paid or suspended", () => {
    expect(arbitrateStudioOffer({ paid: false, launchQuarterOpen: false, studioLaunchOpen: false })).toBe("none");
    expect(arbitrateStudioOffer({ paid: true, launchQuarterOpen: true, studioLaunchOpen: true })).toBe("none");
    expect(arbitrateStudioOffer({ paid: false, suspended: true, launchQuarterOpen: true, studioLaunchOpen: true })).toBe("none");
  });
});

describe("bridge helpers", () => {
  it("visible only with flag on and ads ready", () => {
    expect(bridgeVisible({ flag: false, runStatus: "completed", readyAds: 5 })).toBe(false);
    expect(bridgeVisible({ flag: true, runStatus: "generating", readyAds: 5 })).toBe(false);
    expect(bridgeVisible({ flag: true, runStatus: "partial", readyAds: 0 })).toBe(false);
    expect(bridgeVisible({ flag: true, runStatus: "completed", readyAds: 1 })).toBe(true);
  });
  it("picks the first ready unlocked static ad", () => {
    const ads = [
      { id: "m", index: 0, kind: "motion", status: "ready" },
      { id: "b", index: 1, kind: "static", status: "ready", bonusKind: "story", locked: true },
      { id: "f", index: 2, kind: "static", status: "failed" },
      { id: "s", index: 3, kind: "static", status: "ready" },
    ];
    expect(pickBridgeAd(ads)?.id).toBe("s");
    expect(pickBridgeAd([ads[0]!])?.id).toBe("m");
    expect(pickBridgeAd([])).toBeNull();
  });
  it("picks the right asset", () => {
    const a = [{ ratio: "4:5", mime: "image/png" }, { ratio: "9:16", mime: "image/png" }];
    expect(pickBridgeAsset("static", a)?.ratio).toBe("9:16");
    expect(pickBridgeAsset("motion", a)).toBeNull();
    expect(pickBridgeAsset("motion", [{ ratio: "9:16", mime: "video/mp4" }])?.mime).toBe("video/mp4");
  });
  it("prompt carries headline and site", () => {
    const p = bridgePrompt({ starter: "reels", headline: "Fresh bread daily", url: "https://bakery.com" });
    expect(p).toContain("10-second vertical video for Reels");
    expect(p).toContain("Fresh bread daily");
    expect(p).toContain("https://bakery.com");
    expect(bridgePrompt({ starter: "promo", url: "https://www.bakery.com" })).toContain("promo video for bakery.com");
  });
});

describe("video type chips", () => {
  it("prefill a prompt with the user's site, or a neutral fallback", async () => {
    const { videoTypePrompt, STUDIO_VIDEO_TYPES } = await import("../contracts");
    expect(STUDIO_VIDEO_TYPES.map((t) => t.id)).toEqual(expect.arrayContaining(["hype", "demo"]));
    expect(videoTypePrompt("hype", "tidybooks.app")).toBe("Make a hype video ad for tidybooks.app: super fast cuts and energetic.");
    expect(videoTypePrompt("demo", "")).toBe("Make a product demonstration video that shows how it works, step by step.");
    expect(videoTypePrompt("nope", "x.com")).toBe("");
  });
});

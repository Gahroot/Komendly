import { describe, expect, it } from "vitest";
import { EMPTY_HISTORY, foldHistory, historyPrompt, hookOffset, sceneOffset, siteKey } from "../src/jobs/brand-history";
import { sceneFor } from "../src/render/composed/scene";

describe("brand history", () => {
  it("matches the same website regardless of scheme, www and path", () => {
    expect(siteKey("https://www.Acme.com/pricing")).toBe("acme.com");
    expect(siteKey("acme.com")).toBe("acme.com");
    expect(siteKey("http://shop.acme.com")).toBe("shop.acme.com");
  });
  it("counts photo use by file name across runs and keeps headlines and hashes", () => {
    const h = foldHistory([
      { ads: [{ headline: "A", angle: "x", visualBrief: { assetKeys: ["ws/1/brand/p1/assets/aa.jpg"], render: { hash: "h1" } } }] },
      { ads: [{ headline: "B", angle: "y", visualBrief: { assetKeys: ["ws/1/brand/p2/assets/aa.jpg", "ws/1/brand/p2/assets/bb.jpg"] } }] },
    ]);
    expect(h.priorRuns).toBe(2);
    expect(h.photoUse.get("aa.jpg")).toBe(2);
    expect(h.photoUse.get("bb.jpg")).toBe(1);
    expect(h.headlines).toEqual(["A", "B"]);
    expect(h.hashes).toEqual(["h1"]);
  });
  it("first run gets no memory block and no offsets", () => {
    expect(historyPrompt(EMPTY_HISTORY, [{ key: "k" }])).toBe("");
    expect(hookOffset(EMPTY_HISTORY)).toBe(0);
    expect(sceneOffset(EMPTY_HISTORY)).toBe(0);
  });
  it("repeat run lists earlier headlines, least-used photos first, and rotates hooks and scenes", () => {
    const h = foldHistory([{ ads: [{ headline: "Old headline", angle: "old", visualBrief: { assetKeys: ["x/aa.jpg", "x/aa.jpg"] } }] }]);
    const p = historyPrompt(h, [{ key: "y/aa.jpg" }, { key: "y/cc.jpg" }]);
    expect(p).toContain("Old headline");
    expect(p).toContain("key=y/aa.jpg used 2x");
    expect(p).toContain("key=y/cc.jpg used 0x");
    expect(p).toMatch(/signature product/);
    expect(hookOffset(h)).not.toBe(0);
    for (let i = 0; i < 10; i++) expect(sceneFor(i, false, sceneOffset(h))).not.toBe(sceneFor(i, false, 0));
  });
});

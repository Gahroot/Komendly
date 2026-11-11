import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { AdSpec } from "../../src/lib/ads/contracts";
import { attemptCap } from "../src/jobs/replace";
import { fallbackFor, offerLine, typographicSpec, withinFillWindow, isLocked, bonusKindOf, bonusCounts, bonusEnabled } from "../src/jobs/trial-fill";
import { assignLayouts, normalizeTemplate } from "../src/jobs/layouts";
import { intendedCopy } from "../src/jobs/qc";
import { lockedPreview, rankForStories, storyFrame } from "../src/jobs/bonus";
import { bodyProbe } from "../src/render/static/index";
import { requestedTemplate } from "../src/render/static/layout";

const spec = (i: number, layout: string, awareness: AdSpec["awareness"] = "problem_aware"): AdSpec => ({
  index: i, kind: "static", awareness, angle: `a${i}`, hook: "h", headline: "x", body: "b", claims: [],
  visual: { concept: "c", assetKeys: ["p1"], layout, generateImagery: true, imageryPrompt: "x" },
});

describe("trial fill budget", () => {
  const trial = { staticCount: 10, motionCount: 1, isTrial: true };
  it("trial budget is 2x the promised count by default, configurable", () => {
    expect(attemptCap("static", trial, {})).toBe(20);
    expect(attemptCap("static", trial, { ADS_TRIAL_ATTEMPT_FACTOR: "1.5" })).toBe(15);
    expect(attemptCap("motion", trial, {})).toBe(3);
    expect(attemptCap("static", { ...trial, isTrial: false }, {})).toBe(13);
  });
  it("wall-clock cap from confirm", () => {
    const confirmedAt = new Date("2026-11-09T10:00:00Z");
    expect(withinFillWindow({ isTrial: true, confirmedAt }, new Date("2026-11-09T10:24:00Z"), {})).toBe(true);
    expect(withinFillWindow({ isTrial: true, confirmedAt }, new Date("2026-11-09T10:26:00Z"), {})).toBe(false);
    expect(withinFillWindow({ isTrial: true, confirmedAt }, new Date("2026-11-09T10:26:00Z"), { ADS_TRIAL_FILL_MAX_MIN: "40" })).toBe(true);
    expect(withinFillWindow({ isTrial: false, confirmedAt }, new Date("2027-01-01T00:00:00Z"), {})).toBe(true);
  });
  it("goes typographic for every replacement once headroom only covers the missing slots", () => {
    const r = { isTrial: true, staticCount: 10 };
    expect(fallbackFor(r, 12, 20, 4)).toBeNull();
    expect(fallbackFor(r, 15, 20, 4)).toBe("type");
  });
  it("typographic body always names the offer and fits the layout", () => {
    const offer = "$99 Business Readiness Assessment";
    expect(offerLine("Mixed spending makes tax season harder for everyone involved.", offer)).toBe(offer);
    expect(offerLine("The $99 assessment reviews your books.", offer)).toBe("The $99 assessment reviews your books.");
    expect(offerLine(null, offer)).toBe(offer);
    expect(offerLine("x".repeat(90), "Bookkeeping cleanup for small firms, with a written report and next steps for tax season")).toBe("Bookkeeping cleanup for small firms");
    const t = typographicSpec({ ...spec(3, "photo_split"), body: "Generic worry line with no offer at all here" }, [], offer);
    expect(t.body).toBe(offer);
    expect(t.visual.layout).not.toBe("founder_note");
  });
  it("progressively safer fallbacks for the last slots", () => {
    const r = { isTrial: true, staticCount: 10 };
    expect(fallbackFor(r, 11, 20)).toBeNull();
    expect(fallbackFor(r, 13, 20)).toBe("template");
    expect(fallbackFor(r, 16, 20)).toBe("type");
    expect(fallbackFor({ ...r, isTrial: false }, 16, 20)).toBeNull();
  });
  it("typographic fallback drops photos and generated imagery, spreads layouts", () => {
    const t = typographicSpec(spec(3, "photo_split"), ["minimal_type"]);
    expect(t.visual).toMatchObject({ assetKeys: [], generateImagery: false });
    expect(["minimal_type", "offer_card"]).toContain(t.visual.layout);
    expect(t.visual.imageryPrompt).toBeUndefined();
    expect(typographicSpec(spec(3, "x", "unaware"), ["minimal_type", "founder_note"]).visual.layout).not.toBe("offer_card");
  });
});

describe("no fake-UI static layouts", () => {
  it("chat/notification layouts are never assigned", () => {
    const specs = ["chat_moment", "notification", "dm thread", "push alert", "quote_thought"].map((l, i) => spec(i, l));
    const out = assignLayouts(specs, { assets: [], proof: [] });
    expect(out.some((s) => s.visual.layout === "chat_moment" || s.visual.layout === "notification")).toBe(false);
    expect(normalizeTemplate("chat_moment")).toBe("quote_thought");
    expect(requestedTemplate(spec(0, "notification"))).toBe("quote_thought");
    expect(requestedTemplate(spec(0, "chat_moment"))).toBe("quote_thought");
  });
});

describe("body copy in QC", () => {
  it("tells vision when the layout omits the body by design", () => {
    expect(intendedCopy({ headline: "H", body: "B" }, { render: { bodyShown: false } })).toContain("do not fail for a missing body");
    expect(intendedCopy({ headline: "H", body: "B" }, { render: { bodyShown: true } })).toContain('body: "B"');
    expect(intendedCopy({ headline: "H", body: "B" }, null)).toContain('body: "B"');
  });
  it("body probe normalises text", () => {
    expect(bodyProbe("Get it done — today, not Monday!")).toBe("get it done today not monday");
    expect(bodyProbe(null)).toBeNull();
  });
});

describe("locked bonus ads", () => {
  it("env switches and contract flags", () => {
    expect(bonusEnabled({})).toBe(false);
    expect(bonusEnabled({ ADS_TRIAL_BONUS: "1" })).toBe(true);
    expect(bonusCounts({})).toEqual({ stories: 3, motion: 2 });
    expect(bonusCounts({ ADS_TRIAL_BONUS_STORIES: "1", ADS_TRIAL_BONUS_MOTION: "0" })).toEqual({ stories: 1, motion: 0 });
    expect(isLocked({ locked: true, bonusKind: "story" })).toBe(true);
    expect(bonusKindOf({ locked: true, bonusKind: "motion" })).toBe("motion");
    expect(bonusKindOf({ bonusKind: "motion" })).toBeNull();
  });
  it("ranks first-pass ready statics, skipping locked and replaced", () => {
    const a = (id: string, o: Partial<{ kind: string; status: string; qcAttempts: number; index: number; qcReport: unknown; visualBrief: unknown }>) => ({ id, kind: "static", status: "ready", qcAttempts: 0, index: 0, qcReport: {}, visualBrief: {}, ...o });
    const ranked = rankForStories([a("x", { qcAttempts: 1, index: 0 }), a("y", { index: 5 }), a("z", { index: 2 }), a("l", { visualBrief: { locked: true } }), a("m", { kind: "motion" }), a("f", { status: "failed_qc" })]);
    expect(ranked.map((r) => r.id)).toEqual(["z", "y", "x"]);
  });
  it("story frame is 1080x1920; preview is 540 wide, sharp top, blurred bottom", async () => {
    const W = 1080, H = 1350;
    // Stripes: high detail everywhere, so blur shows as low variance.
    const raw = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw.fill(x % 8 < 4 ? 255 : 0, (y * W + x) * 3, (y * W + x) * 3 + 3);
    const src = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
    const story = await sharp(await storyFrame(src)).metadata();
    expect([story.width, story.height]).toEqual([1080, 1920]);
    const p = await lockedPreview(src);
    expect(p.width).toBe(540);
    const meta = await sharp(p.jpg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 540, 675]);
    const std = async (top: number, h: number) => (await sharp(await sharp(p.jpg).extract({ left: 0, top, width: 540, height: h }).greyscale().png().toBuffer()).stats()).channels[0]?.stdev ?? 0;
    expect(await std(20, 100)).toBeGreaterThan(60);
    expect(await std(500, 100)).toBeLessThan(15);
  });
});

describe("text-only cap", () => {
  it("counts only live, unlocked type ads", async () => {
    const { countTypeAds, maxTypeAds } = await import("../src/jobs/trial-fill");
    const ads = [
      { status: "ready", visualBrief: { fallback: "type" } },
      { status: "qc", visualBrief: { layout: "minimal_type" } },
      { status: "failed_qc", visualBrief: { fallback: "type" } },
      { status: "ready", visualBrief: { layout: "photo_hero" } },
      { status: "ready", visualBrief: { fallback: "type", locked: true } },
    ];
    expect(countTypeAds(ads)).toBe(2);
    expect(maxTypeAds({ isTrial: true, staticCount: 10 })).toBe(3);
    expect(maxTypeAds({ isTrial: false, kind: "gift", staticCount: 3 })).toBe(1);
  });
});

describe("retryConcept", () => {
  it("adds the reason and offer once, without stacking", async () => {
    const { retryConcept } = await import("../src/jobs/trial-fill");
    const a = retryConcept("receipts on a desk", "generic desk", "$99 Business Readiness Assessment");
    expect(a).toContain("$99 Business Readiness Assessment");
    const b = retryConcept(a, "still generic", null);
    expect(b.match(/Retry:/g)?.length).toBe(1);
    expect(b.startsWith("receipts on a desk")).toBe(true);
  });
});

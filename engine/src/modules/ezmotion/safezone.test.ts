import { describe, expect, it } from "vitest";
import { motionRules, safeRect, safeZoneIssues, safeZoneReview, sampleTimes, type TextBox } from "./safezone";
import { frameFor } from "./layout";

const box = (o: Partial<TextBox>): TextBox => ({ t: 1, text: "Hello there", x: 100, y: 600, w: 600, h: 120, pill: false, ...o });

describe("reels safe zone", () => {
  it("allows text only between 14% and 65% of the height, 6% in from the sides", () => {
    expect(safeRect("9:16", 1080, 1920)).toEqual({ x0: 1080 * 0.06, y0: 1920 * 0.14, x1: 1080 * 0.94, y1: 1920 * 0.65 });
    expect(safeRect("4:5", 1080, 1350)).toBeNull();
  });
  it("flags a CTA and URL in the bottom 35%, the top band and the side edge", () => {
    const issues = safeZoneIssues([box({}), box({ text: "Book now", y: 1500 }), box({ text: "top", y: 100 }), box({ text: "edge", x: 10 })], "9:16", 1080, 1920);
    expect(issues).toHaveLength(3);
    expect(issues.join("\n")).toMatch(/"Book now".*bottom 35%/);
    expect(issues.join("\n")).toMatch(/"top".*top 14%/);
    expect(issues.join("\n")).toMatch(/"edge".*side/);
  });
  it("ignores off-frame boxes and dedupes by text", () => {
    expect(safeZoneIssues([box({ y: 2000 }), box({ x: -900, w: 500 })], "9:16", 1080, 1920)).toEqual([]);
    expect(safeZoneIssues([box({ y: 1500, t: 1 }), box({ y: 1500, t: 2 })], "9:16", 1080, 1920)).toHaveLength(1);
  });
  it("flags pill-shaped CTAs on any ratio", () => {
    expect(safeZoneIssues([box({ text: "Shop now", pill: true })], "1:1", 1080, 1080)[0]).toMatch(/button/);
  });
  it("hype layout frame matches the reels rule", () => {
    const f = frameFor("9:16");
    const r = safeRect("9:16", f.width, f.height);
    expect(r).not.toBeNull();
    expect(f.safe.top).toBeGreaterThanOrEqual(Math.floor(r?.y0 ?? 0));
    expect(f.height - f.safe.bottom).toBeLessThanOrEqual(Math.ceil(r?.y1 ?? 0));
    expect(f.safe.left).toBeGreaterThanOrEqual(Math.floor(r?.x0 ?? 0));
    expect(f.width - f.safe.right).toBeLessThanOrEqual(Math.ceil(r?.x1 ?? 0));
  });
  it("samples through the end card and writes actionable review/rules text", () => {
    const s = sampleTimes(2, 0.5);
    expect(s[0]).toBe(0.1);
    expect(s.at(-1)).toBe(1.8);
    expect(safeZoneReview(["x"])).toContain("- x");
    expect(motionRules("9:16")).toMatch(/y=1248/);
    expect(motionRules("9:16")).toMatch(/not a button or pill/);
  });
});

describe("motion QC safe-zone check", () => {
  it("reads the render meta", async () => {
    const { safeZoneCheck } = await import("./safezone");
    expect(safeZoneCheck({})).toBeNull();
    expect(safeZoneCheck({ render: { safeZone: { ok: true, checked: false, issues: [] } } })).toBeNull();
    expect(safeZoneCheck({ render: { safeZone: { ok: false, checked: true, issues: ["a", "b"] } } })).toEqual({ name: "motion_safe_zone", pass: false, detail: "a | b" });
  });
});

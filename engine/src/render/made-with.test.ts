import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { applyMadeWithMark, markable, markLayout, markSvg } from "./made-with";

describe("made-with mark", () => {
  it("stays a small corner badge", () => {
    for (const [w, h] of [[1080, 1080], [1080, 1920], [1200, 628]] as const) {
      const l = markLayout(w, h, "ab12cd34");
      expect(l.left + l.width).toBeLessThanOrEqual(w);
      expect(l.top + l.height).toBeLessThanOrEqual(h);
      expect((l.width * l.height) / (w * h)).toBeLessThan(0.03);
      expect(l.left).toBeGreaterThan(w / 2);
      expect(l.top).toBeGreaterThan(h / 2);
    }
  });
  it("svg carries label + short link, escaped", () => {
    const svg = markSvg(markLayout(1080, 1080, "ab12cd34"), "ab12cd34");
    expect(svg).toContain("Made with Komendly");
    expect(svg).toContain("komendly.com/m/ab12cd34");
  });
  it("composites onto png and keeps size/format", async () => {
    const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const out = await applyMadeWithMark(png, "ab12cd34");
    const m = await sharp(out).metadata();
    expect([m.format, m.width, m.height]).toEqual(["png", 400, 400]);
    const corner = await sharp(out).extract({ left: 399, top: 399, width: 1, height: 1 }).raw().toBuffer();
    expect(corner[0]).toBe(255); // outside the badge margin
    expect(Buffer.compare(out, png)).not.toBe(0);
  });
  it("only ad images", () => {
    expect(markable({ mime: "image/png", ratio: "1:1" })).toBe(true);
    expect(markable({ mime: "image/png", ratio: "poster" })).toBe(false);
    expect(markable({ mime: "video/mp4", ratio: "9:16" })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { componentFile, describeComponent, overlapShare, pickComponents, type ComponentCandidate } from "../src/studio/site-components";

const c = (id: number, kind: ComponentCandidate["kind"], x: number, y: number, w: number, h: number): ComponentCandidate => ({ id, kind, x, y, w, h, label: `c${id}` });

describe("site components", () => {
  it("overlap share is relative to the smaller box", () => {
    expect(overlapShare({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 20, h: 20 })).toBe(1);
    expect(overlapShare({ x: 0, y: 0, w: 100, h: 100 }, { x: 200, y: 0, w: 50, h: 50 })).toBe(0);
  });
  it("prefers hero, pricing and reviews, drops nested duplicates, keeps page order", () => {
    const picked = pickComponents([
      c(1, "section", 0, 900, 1440, 800),
      c(2, "card", 100, 1000, 300, 400),
      c(3, "hero", 0, 0, 1440, 800),
      c(4, "hero", 0, 50, 1400, 700),
      c(5, "pricing", 100, 2000, 400, 600),
      c(6, "testimonial", 600, 2000, 400, 300),
    ]);
    expect(picked.map((p) => p.id)).toEqual([3, 2, 5, 6]);
  });
  it("caps the total", () => {
    const kinds = ["card", "product", "feature", "testimonial", "pricing"] as const;
    const many = Array.from({ length: 20 }, (_, i) => c(i, kinds[i % 5]!, (i % 4) * 360, Math.floor(i / 4) * 500, 300, 400));
    expect(pickComponents(many, 8)).toHaveLength(8);
    expect(pickComponents(Array.from({ length: 9 }, (_, i) => c(i, "card", i * 400, 0, 300, 300)))).toHaveLength(3);
  });
  it("names and describes files", () => {
    expect(componentFile({ kind: "pricing" }, 2)).toBe("03-pricing.png");
    expect(describeComponent({ file: "01-hero.png", kind: "hero", label: "Fast drains", width: 2880, height: 1600 })).toBe('./brand/site/01-hero.png (hero: "Fast drains", 2880x1600)');
  });
});

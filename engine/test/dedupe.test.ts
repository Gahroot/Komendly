import { describe, expect, it } from "vitest";
import { findNearDuplicates } from "../src/jobs/dedupe";
import { awarenessSlots } from "../src/jobs/plan";

describe("plan dedupe", () => {
  it("flags reworded duplicates and keeps distinct angles", () => {
    const ads = [
      { angle: "Late-night invoice chasing", hook: "It's 11pm and I'm still chasing invoices", headline: "Stop chasing invoices at 11pm" },
      { angle: "Client ghosting after delivery", hook: "They loved the work, then went silent", headline: "Get paid without the awkward follow-up" },
      { angle: "Late night invoice chasing again", hook: "11pm and still chasing invoices", headline: "Stop chasing invoices at midnight" },
    ];
    expect(findNearDuplicates(ads)).toEqual([2]);
  });
  it("expands the trial awareness mix to exact counts", () => {
    const s = awarenessSlots({ problem_aware: 7, solution_aware: 3 }, 10);
    expect(s.filter((x) => x === "problem_aware")).toHaveLength(7);
    expect(s.filter((x) => x === "solution_aware")).toHaveLength(3);
    expect(awarenessSlots({ problem_aware: 7, solution_aware: 3 }, 5)).toHaveLength(5);
  });
});

import { assignLayouts } from "../src/jobs/layouts";
import type { AdSpec } from "../../src/lib/ads/contracts";

describe("layout assignment", () => {
  const spec = (i: number, layout: string, awareness: AdSpec["awareness"] = "problem_aware"): AdSpec => ({
    index: i, kind: "static", awareness, angle: `a${i}`, hook: "h", headline: "x", claims: [],
    visual: { concept: "c", assetKeys: [], layout, generateImagery: true },
  });
  const assets = [1, 2, 3].map((n) => ({ key: `k${n}`, sourceUrl: "", kind: "screenshot" as const, width: 1200, height: 800, hasFace: false }));
  it("forces >= 6 templates, >= 3 asset ads, <= 2 imagery, no ungrounded stat/testimonial", () => {
    const specs = Array.from({ length: 10 }, (_, i) => spec(i, i % 2 ? "quote_thought" : "stat_card", i < 7 ? "problem_aware" : "solution_aware"));
    specs[9] = spec(9, "testimonial", "solution_aware");
    const out = assignLayouts(specs, { assets, proof: [] });
    const layouts = out.map((s) => s.visual.layout);
    expect(new Set(layouts).size).toBeGreaterThanOrEqual(6);
    expect(layouts).not.toContain("stat_card");
    expect(layouts).not.toContain("testimonial");
    expect(out.filter((s) => s.visual.assetKeys.length > 0).length).toBeGreaterThanOrEqual(3);
    expect(out.filter((s) => s.visual.generateImagery).length).toBeLessThanOrEqual(2);
    expect(assignLayouts(specs, { assets, proof: [] })).toEqual(out);
  });
});

describe("image-led layouts", () => {
  const spec = (i: number, awareness: AdSpec["awareness"]): AdSpec => ({
    index: i, kind: "static", awareness, angle: `a${i}`, hook: "h", headline: "x", claims: [],
    visual: { concept: "c", assetKeys: [], layout: "quote_thought", generateImagery: false },
  });
  const photos = [1, 2, 3, 4].map((n) => ({ key: `p${n}`, sourceUrl: "", kind: "photo" as const, width: 1600, height: 1000, hasFace: n === 1 }));
  const templates = ["quote_thought", "chat_moment", "notification", "pain_list", "before_after", "minimal_type", "photo_fullbleed", "photo_split", "photo_caption", "photo_collage", "offer_card"];
  it(">= 5 of 10 ads use runtime image templates with distinct real images", () => {
    const specs = Array.from({ length: 10 }, (_, i) => spec(i, i < 7 ? "problem_aware" : "solution_aware"));
    const out = assignLayouts(specs, { assets: photos, proof: [], templates });
    const img = out.filter((s) => s.visual.layout.startsWith("photo_"));
    expect(img.length).toBeGreaterThanOrEqual(5);
    expect(img.every((s) => s.visual.assetKeys.length > 0)).toBe(true);
    expect(new Set(out.map((s) => s.visual.layout)).size).toBeGreaterThanOrEqual(6);
    expect(out.every((s) => templates.includes(s.visual.layout))).toBe(true);
  });
  it("no image layouts without usable images", () => {
    const out = assignLayouts(Array.from({ length: 10 }, (_, i) => spec(i, "problem_aware")), { assets: [], proof: [], templates });
    expect(out.some((s) => s.visual.layout.startsWith("photo_"))).toBe(false);
  });
});

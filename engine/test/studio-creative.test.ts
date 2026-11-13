import { describe, expect, it } from "vitest";
import { conceptPrompt, needsRework, reworkPrompt } from "../src/studio/creative";
import { turnPrompt } from "../src/studio/brief";

describe("creative direction", () => {
  it("concept prompt carries the request and the brand assets", () => {
    const p = conceptPrompt({ userText: "15s promo for my bakery", brand: { name: "Crumb", url: "https://crumb.co", colors: [{ hex: "#C05A3A", role: "primary" }], photos: [{ file: "a.jpg", caption: "croissants" }], site: [{ file: "01-hero.png", kind: "hero", label: "Fresh daily" }] } });
    expect(p).toContain("15s promo for my bakery");
    expect(p).toContain("brand/photos/a.jpg (croissants)");
    expect(p).toContain("brand/site/01-hero.png");
    expect(conceptPrompt({ userText: "x", brand: null })).toContain("No brand on file");
  });
  it("rework only when it matters", () => {
    expect(needsRework({ score: 8, templated: false, broken: [], notes: ["x"] })).toBe(false);
    expect(needsRework({ score: 9, templated: false, broken: ["2s text overlaps"], notes: [] })).toBe(true);
    expect(needsRework({ score: 6, templated: false, broken: [], notes: [] })).toBe(true);
    expect(needsRework({ score: 7, templated: true, broken: [], notes: [] })).toBe(true);
    expect(reworkPrompt({ score: 5, templated: true, broken: ["3s cut-off text"], notes: ["add depth"] })).toContain("FIX: 3s cut-off text");
  });
  it("turn prompt points the builder at the concept", () => {
    expect(turnPrompt({ userText: "hi", firstTurn: true, attached: [], concept: true })).toContain("./concept.md");
    expect(turnPrompt({ userText: "hi", firstTurn: true, attached: [] })).not.toContain("concept.md");
  });
});

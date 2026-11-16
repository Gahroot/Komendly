import { describe, expect, it } from "vitest";
import { brandLook, brandLookCss, contrast, ensureContrast, parseHex } from "./brand-tokens";

const rgb = (h: string) => parseHex(h) ?? [0, 0, 0];

describe("brand tokens", () => {
  it("parses hex", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("0a0B0c")).toEqual([10, 11, 12]);
    expect(parseHex("red")).toBeNull();
  });

  it("ensureContrast keeps good colours and fixes bad ones", () => {
    expect(ensureContrast([0, 0, 0], [255, 255, 255], 4.5)).toEqual([0, 0, 0]);
    expect(contrast(ensureContrast(rgb("#ffd400"), rgb("#ffffff"), 4.5), rgb("#ffffff"))).toBeGreaterThanOrEqual(4.5);
  });

  it("ink and muted reach 4.5:1 even when brand text colour is weak", () => {
    const look = brandLook({ colors: [{ hex: "#f5f0e6", role: "background" }, { hex: "#e8c9a0", role: "text" }, { hex: "#c2410c", role: "primary" }], fonts: [] });
    const field = rgb(look.tokens["--field"] ?? "");
    expect(contrast(rgb(look.tokens["--ink"] ?? ""), field)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(look.tokens["--muted"] ?? ""), field)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(look.tokens["--accent"] ?? ""), field)).toBeGreaterThanOrEqual(3);
  });

  it("without a background colour the field is a deep primary tint", () => {
    const look = brandLook({ colors: [{ hex: "#16a34a", role: "primary" }], fonts: [] });
    const field = rgb(look.tokens["--field"] ?? "");
    expect(contrast(field, [0, 0, 0])).toBeLessThan(2);
    expect(look.tokens["--accent"]).toBe("#16a34a");
    expect(contrast(rgb(look.tokens["--ink"] ?? ""), field)).toBeGreaterThanOrEqual(7);
  });

  it("uses brand fonts first with bundled fallbacks, installing only bundled families", () => {
    const look = brandLook({ colors: [], fonts: [{ family: "Inter", role: "body" }, { family: "fraunces", role: "heading" }] }, ["Fraunces", "Host Grotesk"]);
    expect(look.tokens["--display"]).toBe('"Fraunces", "Bricolage Grotesque", sans-serif');
    expect(look.tokens["--text"]).toBe('"Inter", "Host Grotesk", sans-serif');
    expect(look.fonts).toEqual(["Fraunces", "Host Grotesk", "Martian Mono"]);
  });

  it("is deterministic and writes every token on .look-brand", () => {
    const b = { colors: [{ hex: "#123456" }], fonts: [] };
    const css = brandLookCss(brandLook(b));
    expect(css).toBe(brandLookCss(brandLook(b)));
    for (const t of ["--field", "--field-2", "--ink", "--accent", "--muted", "--line", "--display", "--text", "--mono", "--radius"]) expect(css).toContain(`  ${t}: `);
    expect(css).toContain(".look-brand {");
  });
});

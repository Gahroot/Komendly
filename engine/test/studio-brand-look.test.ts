import { describe, expect, it } from "vitest";
import { brandLook } from "../src/studio/brand-tokens";

describe("brand look tokens", () => {
  it("adds punch.js tokens from the brand: second colour, light paper, serif accent", () => {
    const l = brandLook({ colors: [{ hex: "#FF6B35", role: "primary" }, { hex: "#2BB3A3", role: "secondary" }, { hex: "#0F1D24", role: "background" }], fonts: [] } as never, ["Fraunces"]);
    expect(l.tokens["--accent-2"]!.toLowerCase()).not.toBe(l.tokens["--accent"]!.toLowerCase());
    expect(l.tokens["--paper"]).toMatch(/^#f/i);
    expect(l.tokens["--serif"]).toContain("Fraunces");
    expect(l.fonts).toContain("Fraunces");
  });
  it("one-colour brands still get a distinct second colour", () => {
    const l = brandLook({ colors: [{ hex: "#2563EB", role: "primary" }], fonts: [] } as never);
    expect(l.tokens["--accent-2"]!.toLowerCase()).not.toBe(l.tokens["--accent"]!.toLowerCase());
  });
});

import { readFileSync } from "node:fs";
import { CRAFT_RULES } from "../src/studio/brief";
describe("punch kit", () => {
  it("every helper the brief names exists in kit/punch.js", () => {
    const js = readFileSync(new URL("../src/studio/kit/punch.js", import.meta.url), "utf8");
    const named = new Set([...CRAFT_RULES.join("\n").matchAll(/\bP\.([a-zA-Z]+)/g)].map((m) => m[1]!));
    expect(named.size).toBeGreaterThan(8);
    for (const h of named) expect(js, h).toMatch(new RegExp(`\\b${h}\\s*(\\(|:)`));
  });
});

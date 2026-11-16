import { describe, expect, it } from "vitest";
import { parseWorld, worldPrompt, worldSummary } from "../src/studio/brand-world";

const css = `/* WORLD: a pixel night town under a big moon; Fraunces + Geist; chunky violet cards. */\n:root{--ink:#0c0820}\n.world{position:absolute;inset:0}\n@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}\n.t-hero{font-size:14vmin;\n  animation: spin 2s infinite;\n}\n${".card{padding:2vmin}\n".repeat(30)}`;
const html = '<div id="root" data-composition-id="main" data-duration="6"></div>';

describe("brand world", () => {
  it("parses the two blocks and strips CSS animation", () => {
    const w = parseWorld("Here:\n```css\n" + css + "\n```\n```html\n" + html + "\n```");
    expect(w).not.toBeNull();
    expect(w!.css).not.toMatch(/@keyframes|animation:/);
    expect(w!.css).toContain(".world");
    expect(parseWorld("```css\n.x{}\n```")).toBeNull();
  });
  it("summary and prompt", () => {
    expect(worldSummary(css)).toBe("a pixel night town under a big moon; Fraunces + Geist; chunky violet cards.");
    const p = worldPrompt({ name: "Komendly", colors: [{ hex: "#a970fe", role: "accent" }], fonts: [{ family: "Fraunces", role: "heading" }] }, [{ path: "../uploads/ozzy.png", caption: "mascot" }], "Friendly");
    expect(p).toContain("Fraunces (heading)");
    expect(p).toContain("1. ../uploads/ozzy.png (mascot)");
  });
});

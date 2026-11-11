import { describe, expect, it } from "vitest";
import type { AdSpec } from "../../../../src/lib/ads/contracts";
import { BEAT, buildHype, buildScore, planShots, totalBeats } from "./hype";
import { defaultHypeScript, MAX_CARD_WORDS, sanitizeHypeScript } from "./hype-script";
import { frameFor } from "./layout";

const spec: AdSpec = {
  index: 10,
  kind: "motion",
  awareness: "problem_aware",
  angle: "tired of touring houses",
  hook: "We've seen so many houses. Am I supposed to just pick one now?",
  headline: "Do I have to pick a house just because we toured it?",
  cta: "Meet your advocate",
  claims: [{ claim: "No pressure to buy", sourceUrl: "https://x.test" }, { claim: "Clients viewed almost 20 homes", sourceUrl: "https://x.test" }],
  visual: { concept: "", assetKeys: [], layout: "", generateImagery: false },
};

describe("hype script", () => {
  it("keeps short pain cards, drops invented numbers and long cards", () => {
    const raw = {
      cards: [
        { role: "pain", text: "Another house tour.", emphasis: "tour", claimIndex: null },
        { role: "pain", text: "Toured 50 homes already?", emphasis: null, claimIndex: null },
        { role: "pain", text: "Still not sure which one to pick", emphasis: null, claimIndex: null },
        { role: "pain", text: "Which one now?", emphasis: null, claimIndex: null },
        { role: "turn", text: "Take a breath.", emphasis: null, claimIndex: null },
        { role: "proof", text: "Almost 20 homes", emphasis: null, claimIndex: 1 },
        { role: "proof", text: "Saved $5,000", emphasis: null, claimIndex: 0 },
      ],
      endLine: "Pick when you're ready.",
    };
    const { script, fixes } = sanitizeHypeScript(raw, spec);
    expect(script.cards.map((c) => c.text)).toEqual(["Another house tour.", "Which one now?", "Take a breath.", "Almost 20 homes"]);
    expect(fixes.some((f) => f.includes("invented number"))).toBe(true);
    expect(fixes.some((f) => f.includes("proof number not in claim"))).toBe(true);
    expect(script.cards.every((c) => c.text.split(/\s+/).length <= MAX_CARD_WORDS)).toBe(true);
  });
  it("falls back to a script built from the hook", () => {
    const { script, fixes } = sanitizeHypeScript({ nope: 1 }, spec);
    expect(fixes).toContain("hype:invalid");
    expect(script.cards.filter((c) => c.role === "pain").length).toBeGreaterThanOrEqual(2);
    expect(defaultHypeScript(spec).endLine.split(/\s+/).length).toBeLessThanOrEqual(7);
  });
});

describe("hype edit", () => {
  const script = sanitizeHypeScript(
    {
      cards: [
        { role: "pain", text: "Another house tour.", emphasis: null, claimIndex: null },
        { role: "pain", text: "Which one now?", emphasis: null, claimIndex: null },
        { role: "turn", text: "Take a breath.", emphasis: null, claimIndex: null },
        { role: "proof", text: "No pressure to buy", emphasis: null, claimIndex: 0 },
      ],
      endLine: "Pick when you're ready.",
    },
    spec,
  ).script;

  it("puts the drop on a bar line and ends on one", () => {
    const shots = planShots(script, 3, [0, 1, 2]);
    const drop = shots.find((s) => s.kind === "drop");
    expect(drop && drop.startBeat % 4).toBe(0);
    expect(totalBeats(shots) % 4).toBe(0);
    expect(totalBeats(shots) * BEAT).toBeLessThan(15);
    // Cuts at least every 2 beats except the end card.
    expect(shots.filter((s) => s.kind !== "end" && s.kind !== "turn").every((s) => s.beats <= 2)).toBe(true);
  });
  it("never puts a non-photo behind a pain card", () => {
    const shots = planShots(script, 2, []);
    expect(shots.filter((s) => s.kind === "pain").every((s) => s.asset === undefined)).toBe(true);
  });
  it("builds a deterministic composition and a beat-locked score", () => {
    const input = {
      script,
      cta: "Meet your advocate",
      frame: frameFor("9:16"),
      palette: { bg: "#ffffff", ink: "#111111", accent: "#c0703a", accentInk: "#ffffff", surface: "#f4f4f4" },
      brandName: "DOBI",
      domain: "wearedobi.com",
      fontCss: "",
      headingFamily: "Oswald",
      bodyFamily: "Inter",
      logo: null,
      assets: [{ src: "assets/m0.jpg", width: 1600, height: 1000, photo: true, focal: { x: 0.5, y: 0.5 } }],
      gsapSrc: "gsap.min.js",
      seed: 3,
    };
    const a = buildHype(input);
    expect(a.html).toBe(buildHype(input).html);
    expect(a.html).toContain('window.__timelines["main"] = tl;');
    expect(a.html).not.toMatch(/Math\.random|Date\.now/);
    const score = buildScore(a.shots, 3) as { bpm: number; duration: number; hits: Array<{ t: number }> };
    expect(score.bpm).toBe(128);
    expect(score.duration).toBeCloseTo(a.durationSec, 3);
    expect(score.hits.every((h) => h.t <= score.duration)).toBe(true);
  });
});

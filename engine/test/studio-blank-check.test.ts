import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper shared with the agent child process
import { blankFixPrompt, checkTimes, isBlankSpread, lumaSpread } from "../src/modules/ezmotion/agent/blank-check.mjs";

describe("blank-frame QA", () => {
  it("flat frames have ~0 spread, real frames don't", () => {
    expect(isBlankSpread(lumaSpread(new Uint8Array(4096).fill(200)))).toBe(true);
    const noisy = Uint8Array.from({ length: 4096 }, (_, i) => (i % 64 < 20 ? 30 : 230));
    expect(isBlankSpread(lumaSpread(noisy))).toBe(false);
    const faintGradient = Uint8Array.from({ length: 4096 }, (_, i) => 180 + Math.floor((i / 4096) * 6));
    expect(isBlankSpread(lumaSpread(faintGradient))).toBe(true);
  });
  it("check times are evenly spaced inside the video", () => {
    expect(checkTimes(20, 4)).toEqual([2.5, 7.5, 12.5, 17.5]);
    expect(checkTimes(0)).toEqual([]);
  });
  it("fix prompt names the times", () => {
    expect(blankFixPrompt([6, 9.5])).toContain("6s, 9.5s");
  });
});

import { includeInSnapshot } from "../src/studio/project";
describe("snapshot leaves out the kit", () => {
  it("skips ./kit but keeps a user folder named kit deeper down", () => {
    expect(includeInSnapshot("kit/icons/paw-print.svg")).toBe(false);
    expect(includeInSnapshot("index.html")).toBe(true);
    expect(includeInSnapshot("assets/kit/logo.svg")).toBe(true);
  });
});

// @ts-expect-error plain .mjs helper
import { hasAudio, wantsSilence } from "../src/modules/ezmotion/agent/blank-check.mjs";
describe("music gate", () => {
  it("spots audio in a composition", () => {
    expect(hasAudio('<audio id="m" src="audio/music.wav" data-start="0"></audio>')).toBe(true);
    expect(hasAudio('<video src="uploads/a.mp4" data-start="0"></video>')).toBe(true);
    expect(hasAudio('<video src="uploads/a.mp4" muted></video><div></div>')).toBe(false);
    expect(hasAudio("<div>no sound</div>")).toBe(false);
  });
  it("respects a request for silence", () => {
    expect(wantsSilence("make it 15s, no music please")).toBe(true);
    expect(wantsSilence("a silent video for the lobby screen")).toBe(true);
    expect(wantsSilence("music: lofi 82 bpm")).toBe(false);
  });
});

// @ts-expect-error plain .mjs helper
import { layoutProblems, qaFixPrompt } from "../src/modules/ezmotion/agent/blank-check.mjs";
describe("layout gate", () => {
  it("needs several real problems before asking for a fix", () => {
    expect(layoutProblems([{ code: "text_occluded", severity: "info", time: 1 }])).toEqual([]);
    const bad = Array.from({ length: 5 }, (_, i) => ({ code: "text_occluded", severity: "error", time: i, text: `line ${i}` }));
    expect(layoutProblems(bad)).toHaveLength(5);
    expect(layoutProblems(bad.slice(0, 2))).toEqual([]);
    expect(layoutProblems(Array.from({ length: 5 }, (_, i) => ({ code: "text_occluded", severity: "error", time: i, text: "“" })))).toEqual([]);
  });
  it("one combined fix prompt", () => {
    const p = qaFixPrompt({ blank: [3], layout: ["2.0s text covered"], music: true });
    expect(p).toContain("3s");
    expect(p).toContain("text covered");
    expect(p).toContain("score-synth");
  });
});

// @ts-expect-error plain .mjs helper
import { flatBandShare } from "../src/modules/ezmotion/agent/blank-check.mjs";
describe("empty-area check", () => {
  it("bottom half flat = 0.5", () => {
    const w = 64, h = 64;
    const px = Uint8Array.from({ length: w * h }, (_, i) => (i < (w * h) / 2 ? ((i % 7) * 30) : 230));
    expect(flatBandShare(px, w, 4)).toBe(0.5);
    const full = Uint8Array.from({ length: w * h }, (_, i) => (i % 7) * 30);
    expect(flatBandShare(full, w, 4)).toBe(0);
  });
});

// @ts-expect-error plain .mjs helper
import { referencedFiles } from "../src/modules/ezmotion/agent/blank-check.mjs";
describe("missing assets", () => {
  it("lists local references only", () => {
    const html = `<img src="kit/illustrations/croissant.svg"><img src='./brand/photos/a.jpg?x=1'><img src="https://x.com/a.png"><audio src="audio/music.wav"></audio>
      <link rel="stylesheet" href="style.css"><div style="background:url('kit/x.png')"></div><script src="https://cdn/gsap.js"></script><img src="data:image/png;base64,AAA">`;
    expect(referencedFiles(html).sort()).toEqual(["audio/music.wav", "brand/photos/a.jpg", "kit/illustrations/croissant.svg", "kit/x.png", "style.css"]);
  });
});

// @ts-expect-error plain .mjs helper
import { missingPrices } from "../src/modules/ezmotion/agent/blank-check.mjs";
describe("price check", () => {
  it("finds prices the video dropped", () => {
    expect(missingPrices("Offer: $40 off your first deep clean", "<b>0 off</b> your first deep clean")).toEqual(["$40"]);
    expect(missingPrices("free knots over $25", "<p>Free garlic knots over $25.</p>")).toEqual([]);
    expect(missingPrices("listed at $1.25M", "<h2>$1.25M</h2>")).toEqual([]);
    expect(missingPrices("$49 drain cleaning", "<span>&#36;49</span>")).toEqual([]);
    expect(missingPrices("no price here", "<p>x</p>")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper shared with the agent child process
import { cutTimes, flashFixPrompt, flashWindows, hook, motionReport, pacing, pixelFixParts, readability, softenFilter, stillStretches, textThresholds } from "../src/modules/ezmotion/agent/pixel-qa.mjs";
// @ts-expect-error plain .mjs helper shared with the agent child process
import { qaFixPrompt } from "../src/modules/ezmotion/agent/blank-check.mjs";

const frame = (v: number) => new Uint8Array(400).fill(v);

describe("pixel QA: motion", () => {
  it("thresholds scale with width (portrait) and sqrt(w*h) (landscape)", () => {
    expect(textThresholds(1080, 1920)).toEqual({ body: 42, sentence: 36, headline: 90 });
    expect(textThresholds(1920, 1080).body).toBe(Math.round(42 * Math.sqrt(1920 * 1080) / 1080));
    expect(textThresholds(720, 1280).body).toBe(28);
  });
  it("flags a 4 s still, allows a 2 s still and a 4 s end card", () => {
    const lagFrames = 3;
    const moving = Array(10).fill(0.2), still = (n: number) => Array(n).fill(0);
    const mid = stillStretches([...moving, ...still(20 - lagFrames + 1), ...moving], { lagFrames, duration: 10 });
    expect(mid).toHaveLength(1);
    expect(mid[0].seconds).toBeCloseTo(4, 0);
    expect(stillStretches([...moving, ...still(8), ...moving], { lagFrames, duration: 6 })).toEqual([]);
    expect(stillStretches([...moving, ...moving, ...still(17)], { lagFrames, duration: 8 })).toEqual([]);
    const longEnd = stillStretches([...moving, ...still(30)], { lagFrames, duration: 8.6 });
    expect(longEnd[0]?.endCard).toBe(true);
  });
  it("pacing: metronomic only with 4+ equal scenes", () => {
    expect(pacing([2, 4, 6, 8], 10).metronomic).toBe(true);
    expect(pacing([1, 4, 5.5, 8], 10).metronomic).toBe(false);
    expect(pacing([3, 6], 9).metronomic).toBe(false);
    expect(cutTimes([0, 0.5, 0.5, 0, 0, 0.6], 5)).toEqual([0.4, 1.2]);
  });
  it("dead hook vs moving opening; full report on frames", () => {
    expect(hook([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0]).dead).toBe(true);
    expect(hook([0.05, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0]).dead).toBe(false);
    const frames = [...Array(10).keys()].map((i) => frame(i * 20)).concat(Array(25).fill(frame(200)), [...Array(10).keys()].map((i) => frame(i * 20)));
    const r = motionReport(frames, { duration: 9 });
    expect(r.hook.dead).toBe(false);
    expect(r.still.length).toBe(1);
  });
});

describe("pixel QA: text", () => {
  const s = (t: number, items: { text: string; px: number }[]) => ({ t, items });
  it("a small sentence is severe, a short label is advisory, tiny text is severe", () => {
    const big = { text: "BIG", px: 120 };
    const r = readability([s(1, [big, { text: "this line is far too small", px: 30 }, { text: "LABEL", px: 30 }]), s(2, [big, { text: "this line is far too small", px: 30 }, { text: "LABEL", px: 30 }])]);
    expect(r.small.find((x: { text: string }) => x.text === "LABEL").severe).toBe(false);
    expect(r.small.find((x: { text: string }) => x.text.startsWith("this")).severe).toBe(true);
    expect(r.defect).toBe(true);
    const tiny = readability([s(1, [big, { text: "tag", px: 18 }]), s(2, [big, { text: "tag", px: 18 }])]);
    expect(tiny.defect).toBe(true);
    const label = readability([s(1, [big, { text: "LABEL", px: 30 }]), s(2, [big, { text: "LABEL", px: 30 }])]);
    expect(label.defect).toBe(false);
    const ui = readability([s(1, [big, { text: "Building your ad", px: 30 }]), s(2, [big, { text: "Building your ad", px: 30 }])]);
    expect(ui.defect).toBe(true);
  });
  it("no headline-size text at 3+ times is a defect; one-off small words aren't", () => {
    const r = readability([1, 2, 3, 4].map((t) => s(t, [{ text: "Medium words", px: 60 }])));
    expect(r.smallHeadline).toEqual([1, 2, 3, 4]);
    expect(r.defect).toBe(true);
    expect(readability([s(1, [{ text: "BIG", px: 120 }, { text: "fading in words here", px: 10 }])]).defect).toBe(false);
  });
  it("fix parts: defects specific, advice separate; qaFixPrompt carries advice only with defects", () => {
    const motion = { still: [{ start: 3, end: 7, seconds: 4, endCard: false }], hook: { dead: false, weak: false }, pacing: { metronomic: true, scenes: [2, 2, 2, 2] } };
    const { defects, advice } = pixelFixParts({ motion });
    expect(defects[0]).toContain("from 3s to 7s");
    expect(advice[0]).toContain("same length");
    expect(qaFixPrompt({ pixel: defects, advice })).toContain("Also worth improving");
    expect(pixelFixParts({ motion: { ...motion, still: [] } }).defects).toEqual([]);
  });
});

describe("pixel QA: flashing", () => {
  it("merges windows to whole seconds and builds prompt + filter", () => {
    const w = flashWindows({ general: { failures: [{ start: 1.2, end: 2.3 }] }, red: { failures: [{ start: 2.9, end: 3.5 }, { start: 8, end: 8.5 }] } });
    expect(w).toEqual([{ start: 1, end: 4 }, { start: 8, end: 9 }]);
    expect(flashFixPrompt(w)).toContain("1-4s, 8-9s");
    expect(softenFilter(w)).toContain("between(t,0.5,4.5)+between(t,7.5,9.5)");
    expect(flashWindows(null)).toEqual([]);
  });
});

describe("held shots (v2.1)", () => {
  it("flags a mid-video hold of 3 s and ignores the end card", async () => {
    // @ts-expect-error untyped .mjs
    const { heldReport } = await import("../src/modules/ezmotion/agent/pixel-qa.mjs");
    const fps = 5, active = Array(10).fill(0.1), held = Array(15).fill(0.005), end = Array(14).fill(0);
    const r = heldReport([...active, ...held, ...active, ...end], { fps, duration: 9.8 });
    expect(r.stretches.length).toBe(1);
    expect(r.stretches[0].seconds).toBeGreaterThan(2);
    const ok = heldReport([...active, ...active, ...active, ...end], { fps, duration: 9 });
    expect(ok.stretches.length).toBe(0);
  });
  it("counts a slow drift (under 2% per step) as held", async () => {
    // @ts-expect-error untyped .mjs
    const { heldReport } = await import("../src/modules/ezmotion/agent/pixel-qa.mjs");
    expect(heldReport(Array(40).fill(0.015), { fps: 5, duration: 8 }).share).toBeGreaterThan(0.5);
  });
});

// @ts-expect-error plain .mjs helper shared with the agent child process
import { emptyBeats } from "../src/modules/ezmotion/agent/pixel-qa.mjs";
describe("emptyBeats", () => {
  const s = (t: number, text: number, pic = 0) => ({ t, text, pic });
  it("flags a stage left empty for half a second, not a quick wipe or the first frames", () => {
    expect(emptyBeats([s(0, 0), s(0.25, 120), s(0.5, 120), s(0.75, 0), s(1, 120), s(1.25, 0), s(1.5, 10, 0.05), s(1.75, 0), s(2, 120)])).toEqual([{ start: 1.3, end: 2 }]);
    expect(emptyBeats([s(1, 0, 0.5), s(1.25, 20, 0.3)])).toEqual([]);
  });
});

// @ts-expect-error plain .mjs helper shared with the agent child process
import { activity as motionActivity, pixelFixParts as fixParts } from "../src/modules/ezmotion/agent/pixel-qa.mjs";
describe("activity", () => {
  it("share of steps that visibly move; low activity is a defect", () => {
    expect(motionActivity([0.1, 0, 0.05, 0.001])).toBe(0.5);
    const m = { still: [], held: null, hook: { dead: false, weak: false }, pacing: { metronomic: false }, activity: 0.5 };
    expect(fixParts({ motion: m }).defects.join(" ")).toMatch(/Visible motion in only 50%/);
    expect(fixParts({ motion: { ...m, activity: 0.9 } }).defects.length).toBe(0);
  });
});

// @ts-expect-error plain .mjs helper shared with the agent child process
import { collisions } from "../src/modules/ezmotion/agent/pixel-qa.mjs";
describe("collisions", () => {
  it("any text collision counts; clipping must persist", () => {
    const r = collisions([{ t: 1, overlaps: ['"a" / "b"'], clipped: ["ozzy.png"] }, { t: 1.25, overlaps: ['"a" / "b"'], clipped: ["ozzy.png"] }, { t: 2, overlaps: ['"c" / "d"'] }]);
    expect(r.overlaps).toEqual(['"a" / "b" at 1s-1.25s']);
    expect(r.clipped).toEqual([]);
    expect(collisions([1, 1.25, 1.5].map((t) => ({ t, clipped: ["ozzy.png"] }))).clipped).toEqual(["ozzy.png at 1s-1.5s"]);
  });
});

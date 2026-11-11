import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { beatAlignment, freezeReview, freezesOutsideEnd, motionCheck, parseFreezes, parseSceneTimes } from "./motion-checks";
import { beatGrid } from "./quality-render";
import { motionRules } from "./safezone";

const fx = (f: string) => readFileSync(join(__dirname, "__fixtures__", f), "utf8");

describe("motion checks on real ffmpeg output", () => {
  it("parses freezedetect and drops the end-card hold", () => {
    const f = parseFreezes(fx("freezedetect.txt"), 15.1);
    expect(f.length).toBe(3);
    expect(f[0]).toEqual({ start: 11.833, end: 12.433 });
    const outside = freezesOutsideEnd(f, 15.1);
    expect(outside).toEqual([{ start: 11.833, end: 12.433 }]);
  });
  it("closes a freeze still open at EOF", () => {
    expect(parseFreezes("[x] lavfi.freezedetect.freeze_start: 13.5\n[x] lavfi.freezedetect.freeze_duration: 1", 15)).toEqual([{ start: 13.5, end: 15 }]);
  });
  it("parses showinfo scene times and scores beat alignment", () => {
    const cuts = parseSceneTimes(fx("scenes.txt"));
    expect(cuts.length).toBe(8);
    expect(cuts[0]).toBe(2.5);
    expect(cuts.every((c, i) => i === 0 || c > (cuts[i - 1] ?? 0))).toBe(true);
    expect(beatAlignment([0.5, 1.02, 1.7], [0.5, 1, 1.5])).toBe(0.67);
    expect(beatAlignment([], [1])).toBeNull();
  });
  it("feeds QC: informational beat score, fails on freezes left or beat < 30%", () => {
    const vb = (m: object) => ({ render: { motion: { checked: true, cuts: [1, 2], ...m } } });
    expect(motionCheck(vb({ freezes: [], beatOnCut: 0.6 }))?.pass).toBe(true);
    expect(motionCheck(vb({ freezes: [{ start: 1, end: 2 }, { start: 3, end: 4 }], beatOnCut: 0.6 }))?.pass).toBe(false);
    expect(motionCheck(vb({ freezes: [], beatOnCut: 0.2 }))?.pass).toBe(false);
    expect(motionCheck({ render: {} })).toBeNull();
    expect(freezeReview([{ start: 1, end: 1.5 }])).toContain("1.00s to 1.50s");
  });
  it("shifts the beat grid to video time after trimming the intro", () => {
    const g = beatGrid({ tempo: 120.19, beats: [{ time: 3.02 }, { time: 3.52 }, { time: 40 }], strongCues: [{ time: 16.02 }] }, 2.99);
    expect(g.beats).toEqual([0.03, 0.53]);
    expect(g.strong).toEqual([13.03]);
  });
  it("rules ask for acting, layers, no holds, beats and an in-world end card", () => {
    const r = motionRules("9:16");
    for (const k of [/every 2-3 s/, />= 3 depth layers/, /0\.4 s/, /beats\.json/, /first 0\.5 s/, /never a flat white/]) expect(r).toMatch(k);
  });
});

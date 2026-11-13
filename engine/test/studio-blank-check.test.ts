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

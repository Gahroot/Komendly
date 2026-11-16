import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentCutIsFinal, reworkBudgetMs } from "../src/studio/turn";
import { ffmpegPath } from "../src/modules/ezmotion/runtime";

const ctl = new AbortController().signal;

describe("delivery guards", () => {
  it("rework keeps 6 minutes for delivery and is skipped under 4", () => {
    expect(reworkBudgetMs(20 * 60_000)).toBe(14 * 60_000);
    expect(reworkBudgetMs(9 * 60_000)).toBe(0);
    expect(reworkBudgetMs(-1)).toBe(0);
  });
  it("a scratch cut shorter than the composition, or a clip it uses, is not the final video", async () => {
    const d = mkdtempSync(join(tmpdir(), "dg-"));
    writeFileSync(join(d, "index.html"), '<div data-composition-id="m" data-duration="15"><video src="media/clip-a.mp4"></video></div>');
    const ff = await ffmpegPath();
    if (!ff) return;
    const mk = (name: string, sec: number) => {
      execFileSync(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=black:s=64x64:d=${sec}`, join(d, name)]);
      return join(d, name);
    };
    expect(await agentCutIsFinal(mk("clip-a.mp4", 1), d, ctl)).toBe(false);
    expect(await agentCutIsFinal(mk("trim.mp4", 3), d, ctl)).toBe(false);
    expect(await agentCutIsFinal(mk("final.mp4", 14), d, ctl)).toBe(true);
  }, 30_000);
});

import { readFileSync as readKit } from "node:fs";
import { placeholderComposition } from "../src/studio/turn";
describe("placeholder guard", () => {
  it("catches the blank canvas and both sample ads, not a real composition", () => {
    for (const f of ["canvas.html", "punch-9x16.html", "punch-16x9.html"]) expect(placeholderComposition(readKit(new URL(`../src/studio/kit/punch/${f}`, import.meta.url), "utf8")), f).toBe(true);
    expect(placeholderComposition('<!-- PLACEHOLDER: replace --><div class="ln"><span class="t d">Fresh bread daily</span></div>')).toBe(false);
  });
});

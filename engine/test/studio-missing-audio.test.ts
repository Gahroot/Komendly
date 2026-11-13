import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dropMissingAudio, isMissingAudioError } from "../src/studio/missing-audio";

describe("dropMissingAudio", () => {
  it("removes only audio elements whose file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "missing-audio-"));
    await writeFile(join(dir, "real.mp3"), "x");
    await writeFile(join(dir, "index.html"), `<div><audio id="music" src="assets/music.mp3" data-volume="0.2"></audio><audio id="vo" src="real.mp3"></audio><audio src="https://cdn.x/a.mp3"></audio></div>`);
    expect(await dropMissingAudio(dir)).toBe(1);
    const html = await readFile(join(dir, "index.html"), "utf8");
    expect(html).not.toContain("assets/music.mp3");
    expect(html).toContain("real.mp3");
    expect(html).toContain("https://cdn.x/a.mp3");
    expect(await dropMissingAudio(dir)).toBe(0);
  });
  it("recognises the renderer's missing-audio error", () => {
    expect(isMissingAudioError("Render blocked by 1 correctness warning:\n - audio_processing_failed: Audio mix failed; Source not found for audio element music")).toBe(true);
    expect(isMissingAudioError("Chrome could not launch")).toBe(false);
  });
});

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSilenceDetect, planAudioChunks, segmentText } from "../src/testimonial/chunking";
import { buildIphoneFinishArgs, finishedDuration, runBinary, runFfmpeg } from "../src/testimonial/ffmpeg";
import { heuristicActorPicks, keepsReviewVerbatim, stripAudioTags, writeScript } from "../src/testimonial/script";

describe("audio chunking", () => {
  it("parses silencedetect output", () => {
    const s = "[silencedetect @ 0x1] silence_start: -0.01\n[silencedetect @ 0x1] silence_end: 0.4 | silence_duration: 0.41\nfoo\n[silencedetect] silence_start: 5.2\n[silencedetect] silence_end: 5.8 | x\n[silencedetect] silence_start: 9.9\n";
    expect(parseSilenceDetect(s)).toEqual([{ start: 0, end: 0.4 }, { start: 5.2, end: 5.8 }]);
  });
  it("cuts at the latest pause within max, hard-cuts without pauses, all chunks <= max", () => {
    expect(planAudioChunks(20, [{ start: 3, end: 3.4 }, { start: 6, end: 6.5 }, { start: 13, end: 13.6 }], 8)).toEqual([{ start: 0, end: 6.25 }, { start: 6.25, end: 13.3 }, { start: 13.3, end: 20 }]);
    const hard = planAudioChunks(17, [], 8);
    expect(hard).toEqual([{ start: 0, end: 8 }, { start: 8, end: 16 }, { start: 16, end: 17 }]);
    expect(planAudioChunks(5, [], 8)).toEqual([{ start: 0, end: 5 }]);
    expect(planAudioChunks(0, [], 8)).toEqual([]);
    for (const c of planAudioChunks(61.3, [{ start: 7.9, end: 8.4 }, { start: 30, end: 30.2 }], 8)) expect(c.end - c.start).toBeLessThanOrEqual(8);
  });
  it("segments text by sentence within max words", () => {
    const segs = segmentText("Hi. I love this place, the staff are kind and the coffee is great and cheap too. Go!", 8);
    expect(segs.every((s) => s.split(" ").length <= 8)).toBe(true);
    expect(segs.join(" ").replace(/\s+/g, " ")).toBe("Hi. I love this place, the staff are kind and the coffee is great and cheap too. Go!");
  });
});

describe("script", () => {
  it("verbatim check allows inserted fillers but not changed words", () => {
    expect(keepsReviewVerbatim("Okay so, um, best coffee, honestly, in town!", "Best coffee in town.")).toBe(true);
    expect(keepsReviewVerbatim("Best tea in town", "Best coffee in town")).toBe(false);
  });
  it("falls back to the free template without Codex or when Codex rewrites the review", async () => {
    const t = await writeScript(null, { reviewText: "Great food.", businessName: "Bistro", targetSeconds: 20, maxWords: 20, useAI: true });
    expect(t.source).toBe("template");
    expect(t.fullScript).toBe("Okay so, honestly... you won't believe what happened when I tried this. Great food. So yeah, check out Bistro. You'll thank me.");
    expect(t.segments.map((x) => x.text).join(" ")).toContain("[pause]");
    expect(stripAudioTags("Honestly [laughs] it was, well, [pause] great .")).toBe("Honestly it was, well, great.");
    const paid = { name: "openai" as const, text: async () => { throw new Error("must not call paid API"); }, image: async () => { throw new Error("no"); }, health: async () => ({ ok: true }) };
    expect((await writeScript(paid, { reviewText: "Great food.", targetSeconds: 20, maxWords: 20, useAI: true })).source).toBe("template");
    const liar = { ...paid, name: "codex" as const, text: async () => ({ text: "", json: { hook: "h", testimonial: "Okay food.", cta: "c", segments: [{ text: "Okay food.", direction: "d" }] }, usage: { costMicros: 0, latencyMs: 0 } }) };
    expect((await writeScript(liar, { reviewText: "Great food.", targetSeconds: 20, maxWords: 20, useAI: true })).source).toBe("template");
  });
  it("heuristic actor picks prefer industry overlap, deterministic", () => {
    const actors = [
      { id: "a", name: "A", gender: "f", style: "casual", tags: [], industries: ["fitness"] },
      { id: "b", name: "B", gender: "m", style: "casual", tags: ["coffee"], industries: ["restaurant"] },
    ];
    expect(heuristicActorPicks("Best coffee ever", "Bean Bar", actors, 2).map((p) => p.actorId)).toEqual(["b", "a"]);
  });
});

describe("iPhone finish ffmpeg args", () => {
  const inputs = [{ path: "a.mp4", duration: 7.5 }, { path: "b.mp4", duration: 6 }, { path: "c.mp4", duration: 5 }];
  it("builds a deterministic 1080x1920/30fps H.264 high + AAC, -16 LUFS, crossfaded, metadata-stripped command", () => {
    const args = buildIphoneFinishArgs({ inputs, output: "out.mp4", crossfade: 0.12, seed: 42 });
    expect(args).toEqual(buildIphoneFinishArgs({ inputs, output: "out.mp4", crossfade: 0.12, seed: 42 }));
    const fc = args[args.indexOf("-filter_complex") + 1] ?? "";
    expect(fc).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30");
    expect(fc).toContain("xfade=transition=fade:duration=0.12:offset=7.38");
    expect(fc).toContain("offset=13.26");
    expect(fc).toContain("acrossfade=d=0.12");
    expect(fc).toMatch(/crop=1080:1920:x='[^']*sin\(t/);
    expect(fc).toContain("noise=");
    expect(fc).toContain("unsharp=");
    expect(fc).toContain("amix=inputs=2");
    expect(fc).toContain("loudnorm=I=-16");
    expect(args.join(" ")).toContain("anoisesrc=color=brown");
    for (const pair of [["-c:v", "libx264"], ["-profile:v", "high"], ["-c:a", "aac"], ["-r", "30"], ["-map_metadata", "-1"], ["-pix_fmt", "yuv420p"]]) {
      expect(args[args.indexOf(pair[0] as string) + 1]).toBe(pair[1]);
    }
    expect(args).toContain("filter_units=remove_types=6");
    expect(args.at(-1)).toBe("out.mp4");
    expect(finishedDuration(inputs, 0.12)).toBeCloseTo(18.26);
  });
  it("single input has no joins; crossfade 0 uses concat", () => {
    const one = buildIphoneFinishArgs({ inputs: [inputs[0] as (typeof inputs)[0]], output: "o.mp4", roomTone: false });
    const fc1 = one[one.indexOf("-filter_complex") + 1] ?? "";
    expect(fc1).not.toContain("xfade");
    expect(fc1).not.toContain("amix");
    const cat = buildIphoneFinishArgs({ inputs, output: "o.mp4", crossfade: 0 });
    expect(cat[cat.indexOf("-filter_complex") + 1]).toContain("concat=n=2");
    expect(() => buildIphoneFinishArgs({ inputs: [], output: "o" })).toThrow();
  });
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

describe.skipIf(!hasFfmpeg)("iPhone finish (real ffmpeg on lavfi test clips)", () => {
  it("produces 1080x1920 30fps H.264 High + AAC with no encoder tag", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "iphone-"));
    try {
      const clips = [];
      for (const [i, size] of ["720x1280", "1280x720"].entries()) {
        const p = path.join(dir, `c${i}.mp4`);
        await runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=24:duration=1.5`, "-f", "lavfi", "-i", "sine=frequency=330:duration=1.5", "-shortest", "-c:v", "libx264", "-c:a", "aac", "-metadata", "comment=AI generated", p]);
        clips.push({ path: p, duration: 1.5 });
      }
      const out = path.join(dir, "out.mp4");
      await runFfmpeg(buildIphoneFinishArgs({ inputs: clips, output: out, crossfade: 0.12, seed: 1 }));
      const { stdout } = await runBinary("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,profile,width,height,r_frame_rate:format=duration:format_tags", "-of", "json", out]);
      const j = JSON.parse(stdout) as { streams: Array<Record<string, unknown>>; format: { duration: string; tags?: Record<string, string> } };
      const v = j.streams.find((s) => s.codec_type === "video");
      const a = j.streams.find((s) => s.codec_type === "audio");
      expect(v).toMatchObject({ codec_name: "h264", profile: "High", width: 1080, height: 1920, r_frame_rate: "30/1" });
      expect(a).toMatchObject({ codec_name: "aac" });
      expect(Number(j.format.duration)).toBeCloseTo(2.88, 0);
      expect(JSON.stringify(j.format.tags ?? {})).not.toMatch(/Lavf|AI generated/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!hasFfmpeg)("iPhone finish on an OmniHuman-like single take", () => {
  it("upscales 720x1280@24 with audio to 1080x1920@30, A/V durations match", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "omni-"));
    try {
      const src = path.join(dir, "omni.mp4");
      await runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24:duration=3", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-c:v", "libx264", "-c:a", "aac", src]);
      const out = path.join(dir, "out.mp4");
      const args = buildIphoneFinishArgs({ inputs: [{ path: src, duration: 3 }], output: out, shakePx: 1.5, grain: 3, seed: 9 });
      expect(args[args.indexOf("-filter_complex") + 1]).toContain("crop=1080:1920:x='5+0.9*sin");
      await runFfmpeg(args);
      const { stdout } = await runBinary("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,duration", "-of", "json", out]);
      const s = (JSON.parse(stdout) as { streams: Array<Record<string, string | number>> }).streams;
      const v = s.find((x) => x.codec_type === "video");
      const a = s.find((x) => x.codec_type === "audio");
      expect(v).toMatchObject({ width: 1080, height: 1920, r_frame_rate: "30/1" });
      expect(Number(v?.duration)).toBeCloseTo(3, 0);
      expect(Math.abs(Number(v?.duration) - Number(a?.duration))).toBeLessThan(0.1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanUploadNames, turnPrompt } from "../src/studio/brief";
import { finalArgs, ratioOf, watermarkGeometry } from "../src/studio/media";
import { includeInSnapshot, listSnapshotFiles, pickDelivered } from "../src/studio/project";

describe("watermark + delivery ffmpeg args", () => {
  it("overlays bottom-right inside the safe area, caps length, faststart", () => {
    const g = watermarkGeometry(1080, 1920);
    expect(g.marginY).toBe(384); // tall: clear of the Reels/TikTok bottom band
    const a = finalArgs({ input: "in.mp4", output: "out.mp4", maxSeconds: 30, watermark: { png: "wm.png", g }, hasAudio: true });
    expect(a).toEqual(["-y", "-v", "error", "-i", "in.mp4", "-i", "wm.png", "-t", "30", "-filter_complex", `[0:v][1:v]overlay=x=W-w-${g.marginX}:y=H-h-384:format=auto,format=yuv420p[v]`, "-map", "[v]", "-map", "0:a:0?", "-c:a", "aac", "-b:a", "160k", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-movflags", "+faststart", "out.mp4"]);
    expect(watermarkGeometry(1920, 1080).marginY).toBe(49);
  });
  it("no watermark: plain map, no audio when absent", () => {
    const a = finalArgs({ input: "i", output: "o", maxSeconds: 90, hasAudio: false });
    expect(a).not.toContain("-filter_complex");
    expect(a).not.toContain("-c:a");
    expect(a.slice(5, 7)).toEqual(["-t", "90"]);
  });
  it("ratios", () => {
    expect(ratioOf(1080, 1920)).toBe("9:16");
    expect(ratioOf(1080, 1350)).toBe("4:5");
    expect(ratioOf(1000, 1000)).toBe("1:1");
    expect(ratioOf(1920, 1080)).toBe("16:9");
  });
});

describe("project snapshot", () => {
  it("excludes node_modules, caches, uploads, brand, rendered videos and the delivered file", () => {
    expect(includeInSnapshot("promo/index.html")).toBe(true);
    expect(includeInSnapshot("promo/cuts/clip1.mp4")).toBe(true);
    expect(includeInSnapshot("studio.md")).toBe(true);
    expect(includeInSnapshot("node_modules/x/index.js")).toBe(false);
    expect(includeInSnapshot("promo/.cache/a")).toBe(false);
    expect(includeInSnapshot("uploads/clip.mp4")).toBe(false);
    expect(includeInSnapshot("brand/logo.png")).toBe(false);
    expect(includeInSnapshot("renders/v1.mp4")).toBe(false);
    expect(includeInSnapshot("promo/renders/v2.mp4")).toBe(false);
    expect(includeInSnapshot("out/final.mp4", new Set(["out/final.mp4"]))).toBe(false);
  });
  it("lists files from disk in sorted order", async () => {
    const d = await mkdtemp(join(tmpdir(), "studio-snap-"));
    try {
      for (const f of ["b/index.html", "a.txt", "node_modules/m.js", "renders/v1.mp4", "uploads/u.mp4"]) {
        await mkdir(join(d, f, ".."), { recursive: true });
        await writeFile(join(d, f), "x");
      }
      expect(await listSnapshotFiles(d)).toEqual(["a.txt", "b/index.html"]);
      await utimes(join(d, "a.txt"), new Date(), new Date());
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
  it("picks the newest new/changed video, preferring renders/", () => {
    const before = new Map([["renders/v1.mp4", 1000]]);
    const after = new Map([["renders/v1.mp4", 1000], ["cuts/c1.mp4", 5000], ["renders/v2.mp4", 5500]]);
    expect(pickDelivered(before, after)).toBe("renders/v2.mp4");
    expect(pickDelivered(before, new Map(before))).toBeNull();
  });
});

describe("brief", () => {
  it("cleans and dedupes upload names", () => {
    expect(cleanUploadNames(["My Clip (1).MOV", "my clip 1.mov", "../x.png"])).toEqual(["my-clip-1.mov", "my-clip-1-2.mov", "x.png"]);
  });
  it("first turn points at studio.md and lists attachments", () => {
    const p = turnPrompt({ userText: "Cut this", firstTurn: true, attached: [{ file: "a.mp4", kind: "video", durationSec: 12, width: 1920, height: 1080 }] });
    expect(p).toContain("./studio.md");
    expect(p).toContain("./uploads/a.mp4 (video, 12.0s, 1920x1080)");
    expect(turnPrompt({ userText: "make it yellow", firstTurn: false, attached: [] })).toMatch(/^make it yellow\n\n\[Studio note: Do NOT run hf render/);
  });
});

import { canCopyVideo } from "../src/studio/media";
describe("delivery remux", () => {
  const h264 = { vcodec: "h264", pixFmt: "yuv420p", durationSec: 20 };
  it("copies an H.264 yuv420p render with no watermark within the cap", () => {
    expect(canCopyVideo(h264, { watermark: false, maxSeconds: 60 })).toBe(true);
  });
  it("re-encodes for a watermark, a length cut or another codec", () => {
    expect(canCopyVideo(h264, { watermark: true, maxSeconds: 60 })).toBe(false);
    expect(canCopyVideo(h264, { watermark: false, maxSeconds: 15 })).toBe(false);
    expect(canCopyVideo({ ...h264, vcodec: "hevc" }, { watermark: false, maxSeconds: 60 })).toBe(false);
    expect(canCopyVideo({ ...h264, pixFmt: "yuv444p" }, { watermark: false, maxSeconds: 60 })).toBe(false);
  });
  it("remux args stream-copy video and keep faststart", () => {
    const a = finalArgs({ input: "i", output: "o", maxSeconds: 60, hasAudio: true, copy: { video: true, audio: true } });
    expect(a.join(" ")).toContain("-c:v copy");
    expect(a.join(" ")).toContain("-c:a copy");
    expect(a).toContain("+faststart");
    expect(a).not.toContain("libx264");
  });
});

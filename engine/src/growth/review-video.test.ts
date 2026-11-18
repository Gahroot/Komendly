import { describe, expect, it } from "vitest";
import { buildScenes, inkFor, quotePages, quoteVideoArgs, wrap } from "./review-video";

const p = { giftId: "g", businessName: "Acme Plumbing", domain: "acme.com", reviewerName: "Jane D.", quote: "They fixed our leak in an hour. Friendly & fair <3", rating: 5, brandColor: "#FFDD00" };

describe("review quote video", () => {
  it("keeps the review's words verbatim across pages and escapes markup", () => {
    expect(quotePages(p.quote).flat().join(" ")).toBe(`“${p.quote}”`);
    const svg = buildScenes(p).map((s) => s.svg).join("");
    expect(svg).toContain("Friendly &amp;"); expect(svg).toContain("fair &lt;3");
    expect(svg).toContain("— Jane D.");
    expect(svg).toContain("Review published on acme.com");
    expect(svg).not.toMatch(/AI presenter/);
  });
  it("wraps, picks readable ink, builds crossfade args", () => {
    expect(wrap("a bb ccc dddd", 6)).toEqual(["a bb", "ccc", "dddd"]);
    expect(inkFor("#FFDD00")).toBe("#111111");
    expect(inkFor("#1F2A44")).toBe("#FFFFFF");
    const a = quoteVideoArgs(["a.png", "b.png", "c.png"], [2, 3, 2], "o.mp4");
    expect(a.join(" ")).toContain("xfade=transition=fade:duration=0.4:offset=1.60[x1]");
    expect(a.join(" ")).toContain("offset=4.20[vout]");
    expect(a.at(-1)).toBe("o.mp4");
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { runFfmpeg } from "../testimonial/ffmpeg";

const hasFfmpeg = (() => { try { execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-version"]); return true; } catch { return false; } })();
describe.skipIf(!hasFfmpeg)("renders a real mp4 locally ($0)", () => {
  it("sharp frames + ffmpeg", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "rq-"));
    const scenes = buildScenes(p);
    const files = await Promise.all(scenes.map(async (s, i) => { const f = path.join(dir, `s${i}.png`); writeFileSync(f, await sharp(Buffer.from(s.svg)).png().toBuffer()); return f; }));
    const out = path.join(dir, "o.mp4");
    await runFfmpeg(quoteVideoArgs(files, scenes.map((s) => s.seconds), out));
    expect(statSync(out).size).toBeGreaterThan(10_000);
  }, 60_000);
});

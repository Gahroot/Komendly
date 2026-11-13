// Record a public site like the studio_capture job does (no DB/storage): clips, screenshots, logo + a contact sheet.
// Usage: npx tsx scripts/launch-capture.ts <url> [--aspect 16:9|9:16] [--out dir]
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { guardRoute } from "../src/jobs/extract/crawl";
import { ffmpegPath, run } from "../src/modules/ezmotion/runtime";
import { recordSite } from "../src/studio/capture-record";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? (process.argv[i + 1] ?? d) : d; };
const url = process.argv[2] ?? "https://www.komendly.com";
const aspect = arg("aspect", "16:9") === "9:16" ? "9:16" : "16:9";
const out = arg("out", join(process.env.HOME ?? ".", ".ezcoder/goals/ezmotionkom/launch", new URL(url).hostname + "-" + aspect.replace(":", "x")));
const ff = await ffmpegPath();
if (!ff) throw new Error("ffmpeg missing");
const work = `${out}.work`;
await rm(work, { recursive: true, force: true });
const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-dev-shm-usage"] });
const t0 = Date.now();
try {
  const r = await recordSite({ browser, url, aspect, outDir: work, ffmpeg: ff, signal: AbortSignal.timeout(4 * 60_000), guard: guardRoute, onStep: (s) => console.log("·", s), log: (m, d) => console.log("warn", m, d) });
  await mkdir(out, { recursive: true });
  for (const f of [...r.clips.map((c) => c.file), ...r.shots.map((s) => s.file), ...(r.logo ? [r.logo] : [])]) await cp(f, join(out, f.split("/").pop() ?? "f"));
  // Contact sheet: 4 frames per clip, one row per clip.
  const rows: string[] = [];
  for (const [i, c] of r.clips.entries()) {
    const row = join(work, `row${i}.jpg`);
    const fps = 4 / Math.max(1, c.seconds);
    const g = await run(ff, ["-y", "-v", "error", "-i", c.file, "-vf", `fps=${fps.toFixed(3)},scale=480:-2,tile=4x1:padding=6:color=white`, "-frames:v", "1", row]);
    if (g.code === 0) rows.push(row);
  }
  if (rows.length) await run(ff, ["-y", "-v", "error", ...rows.flatMap((x) => ["-i", x]), "-filter_complex", `${rows.map((_, i) => `[${i}:v]`).join("")}vstack=inputs=${rows.length}`, join(out, "contact-sheet.jpg")]);
  console.log(JSON.stringify({ url, aspect, ms: Date.now() - t0, out, clips: r.clips.map((c) => ({ f: c.filename, s: c.seconds, mb: +(c.bytes / 1e6).toFixed(1), shows: c.shows })), shots: r.shots.length, logo: !!r.logo, brand: r.brand, pages: r.pages }, null, 2));
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}

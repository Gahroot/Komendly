// QUALITY final render: EZ Motion's own motion-blur step (motion-blur.mjs in the @prestyj/cli bundle),
// the same one the desktop app runs for its finished videos (sub-frame blend, feed loudness, flash screen).
// Falls back to the plain HyperFrames render when the bundle is missing or the blur pass fails.
import { createRequire } from "node:module";
import { access, constants, copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ffmpegPath, HF_ENV, renderComposition, run } from "./runtime";

/** Root of the bundled Motion assets (<cli>/assets/motion), or null. */
export async function motionBundleRoot(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const dists: string[] = [];
  if (env.EZMOTION_CLI_DIST?.trim()) dists.push(env.EZMOTION_CLI_DIST.trim());
  try {
    dists.push(dirname(createRequire(import.meta.url).resolve("@prestyj/cli")));
  } catch { /* not a dependency */ }
  dists.push("/usr/local/lib/node_modules/@prestyj/cli/dist");
  for (const d of dists) {
    const root = join(d, "..", "assets", "motion");
    if (await access(join(root, "bin", "motion-blur.mjs"), constants.R_OK).then(() => true, () => false)) return root;
  }
  return null;
}

/** Blur settings: samples/renderFps tuned for Railway (24 vCPU, 15 s ad under ~4 min). */
export function blurSettings(env: NodeJS.ProcessEnv = process.env): { fps: number; samples: number; shutter: number; quality: string; workers?: number } {
  const n = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : d);
  const workers = env.EZMOTION_BLUR_WORKERS ? n(env.EZMOTION_BLUR_WORKERS, 8) : undefined;
  return { fps: 30, samples: n(env.EZMOTION_BLUR_SAMPLES, 3), shutter: n(env.EZMOTION_BLUR_SHUTTER, 270), quality: env.EZMOTION_BLUR_QUALITY ?? "looks", ...(workers ? { workers } : {}) };
}

export interface QualityRender {
  ok: boolean;
  output: string;
  mode: "blur" | "plain";
  ms: number;
  /** Audio already loudness-normalized by the blur step. */
  loudnessDone: boolean;
  flashingSafe?: boolean;
  samples?: number;
  error?: string;
}

/** Renders `dir` to `output` with motion blur; plain 30 fps render if the blur step is unavailable or fails. */
export async function renderQuality(dir: string, output: string, opts: { signal?: AbortSignal; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<QualityRender> {
  const started = Date.now();
  const env = opts.env ?? process.env;
  const root = env.EZMOTION_RENDER_MODE === "fast" ? null : await motionBundleRoot(env);
  let error: string | undefined;
  if (root) {
    const s = blurSettings(env);
    const args = [join(root, "bin", "motion-blur.mjs"), dir, output, "--fps", String(s.fps), "--shutter", String(s.shutter), "--samples", String(s.samples), "--quality", s.quality];
    if (s.workers) args.push("--workers", String(s.workers));
    const r = await run(process.execPath, args, { signal: opts.signal, env: HF_ENV, timeoutMs: opts.timeoutMs ?? 10 * 60_000 });
    const line = r.stdout.trim().split("\n").pop() ?? "";
    let j: { ok?: boolean; flashing?: { safe?: boolean }; samples?: number; error?: string } = {};
    try { j = JSON.parse(line); } catch { /* not JSON */ }
    const size = (await stat(output).catch(() => null))?.size ?? 0;
    if (j.ok && size > 0) return { ok: true, output, mode: "blur", ms: Date.now() - started, loudnessDone: true, flashingSafe: j.flashing?.safe, samples: j.samples };
    // Harmful flashing is a hard fail: never ship it (the caller falls back).
    if (j.flashing && j.flashing.safe === false) return { ok: false, output, mode: "blur", ms: Date.now() - started, loudnessDone: true, flashingSafe: false, error: "flashing screen failed" };
    error = (j.error ?? (r.stderr || r.stdout)).slice(-300);
  }
  // Plain render never overwrites a half-written blur file.
  const plain = root ? `${output.replace(/\.mp4$/, "")}-plain.mp4` : output;
  const rr = await renderComposition(dir, plain, { fps: 30, signal: opts.signal, timeoutMs: 8 * 60_000 });
  const ok = rr.code === 0 && ((await stat(plain).catch(() => null))?.size ?? 0) > 0;
  return { ok, output: plain, mode: "plain", ms: Date.now() - started, loudnessDone: false, ...(ok ? {} : { error: [error, (rr.stderr || rr.stdout).slice(-300)].filter(Boolean).join("; ") }), ...(error && ok ? { error } : {}) };
}

/** Beat grid in VIDEO time: cue times minus `offset` (the trimmed intro), within [0, maxSec]. */
export function beatGrid(cues: { tempo?: number; beats?: Array<{ time: number }>; strongCues?: Array<{ time: number }> }, offset: number, maxSec = 25): { tempo: number | null; offset: number; beats: number[]; strong: number[] } {
  const shift = (xs: Array<{ time: number }> | undefined) => [...new Set((xs ?? []).map((b) => Math.round((b.time - offset) * 100) / 100).filter((t) => t >= 0 && t <= maxSec))].sort((a, b) => a - b);
  return { tempo: typeof cues.tempo === "number" ? Math.round(cues.tempo * 10) / 10 : null, offset, beats: shift(cues.beats), strong: shift(cues.strongCues) };
}

/** Safest bundled SFX (warm, low HF risk) copied as ./brand/sfx/hit-N / click-N / type-N. */
const SFX_PICKS: Array<[string, string]> = [["impact/impactSoft_medium_001.ogg", "hit-1.ogg"], ["impact/impactSoft_medium_004.ogg", "hit-2.ogg"], ["impact/impactSoft_medium_002.ogg", "hit-3.ogg"], ["interface/bong_001.ogg", "accent-1.ogg"], ["ui/click2.ogg", "click-1.ogg"], ["interface/click_003.ogg", "click-2.ogg"]];

/**
 * Copies one bundled licensed track (CC BY 4.0, credit waiver; never Content ID) + its cues into `destDir`.
 * A silent intro before the first beat is trimmed so beat 1 lands at t=0 (the hook hit); ./beats.json holds
 * the beat grid in video seconds. A few safe SFX go to ./sfx.
 */
export async function bundleMusic(destDir: string, seed: string, env: NodeJS.ProcessEnv = process.env): Promise<{ track: string; cues?: string; beats?: number[]; sfx?: string[] } | null> {
  const root = await motionBundleRoot(env);
  if (!root) return null;
  const dir = join(root, "assets", "music");
  const tracks = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".mp3")).sort();
  if (!tracks.length) return null;
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pick = tracks[h % tracks.length] as string;
  const cueJson = join(dir, "cues", pick.replace(/\.mp3$/, ".music-cues.json"));
  const cues = await readFile(cueJson, "utf8").then((t) => JSON.parse(t) as Parameters<typeof beatGrid>[0], () => null);
  const first = cues?.beats?.[0]?.time ?? 0;
  const offset = first > 0.6 ? Math.round((first - 0.03) * 100) / 100 : 0;
  const ff = offset ? await ffmpegPath() : null;
  const trimmed = ff ? (await run(ff, ["-y", "-v", "error", "-ss", String(offset), "-i", join(dir, pick), "-t", "40", "-c:a", "libmp3lame", "-b:a", "192k", join(destDir, "music.mp3")])).code === 0 : false;
  if (!trimmed) await copyFile(join(dir, pick), join(destDir, "music.mp3"));
  const cue = join(dir, "cues", pick.replace(/\.mp3$/, ".music-cues.md"));
  const hasCues = !offset && (await copyFile(cue, join(destDir, "music-cues.md")).then(() => true, () => false));
  let beats: number[] | undefined;
  if (cues) {
    const g = beatGrid(cues, trimmed ? offset : 0);
    beats = g.beats;
    await writeFile(join(destDir, "beats.json"), JSON.stringify({ note: "Seconds in VIDEO time for ./brand/music.mp3 started at t=0. Every scene change and text slam starts on one of these; big moments on `strong`.", ...g }, null, 1));
  }
  const sfxRoot = join(root, "assets", "sfx");
  const sfx: string[] = [];
  await mkdir(join(destDir, "sfx"), { recursive: true }).catch(() => undefined);
  for (const [src, name] of SFX_PICKS) if (await copyFile(join(sfxRoot, src), join(destDir, "sfx", name)).then(() => true, () => false)) sfx.push(name);
  return { track: pick, ...(hasCues ? { cues: "music-cues.md" } : {}), ...(beats ? { beats } : {}), ...(sfx.length ? { sfx } : {}) };
}

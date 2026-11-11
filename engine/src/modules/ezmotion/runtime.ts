// Process helpers: HyperFrames CLI, ffmpeg/ffprobe, flash check. All local, no downloads.
import { execFile, spawn } from "node:child_process";
import { access, constants, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { Limiter } from "../../providers/limiter";
import { VENDOR_DIR } from "./fonts";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

export function run(cmd: string, args: string[], opts: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number; onChunk?: (s: string) => void } = {}): Promise<RunResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, signal: opts.signal, timeout: opts.timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    // Keep only the tail: un-quiet renders print a lot of progress redraws.
    child.stdout.on("data", (d: Buffer) => { const t = d.toString(); stdout = (stdout + t).slice(-200_000); opts.onChunk?.(t); });
    child.stderr.on("data", (d: Buffer) => { const t = d.toString(); stderr = (stderr + t).slice(-200_000); opts.onChunk?.(t); });
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: stderr + String(e), ms: Date.now() - started }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr, ms: Date.now() - started }));
  });
}

export async function which(name: string): Promise<string | null> {
  for (const dir of [...(process.env.PATH ?? "").split(delimiter), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]) {
    if (!dir) continue;
    const p = join(dir, name);
    try {
      await access(p, constants.X_OK);
      return p;
    } catch {
      /* next */
    }
  }
  return null;
}

export async function ffmpegPath(): Promise<string | null> {
  return process.env.HYPERFRAMES_FFMPEG_PATH?.trim() || (await which("ffmpeg"));
}
export async function ffprobePath(): Promise<string | null> {
  const ff = process.env.HYPERFRAMES_FFMPEG_PATH?.trim();
  return process.env.HYPERFRAMES_FFPROBE_PATH?.trim() || (ff ? join(dirname(ff), "ffprobe") : await which("ffprobe"));
}

/** Absolute path of the pinned HyperFrames CLI entry, or null when not installed. */
export function hyperframesEntry(): { entry: string; version: string } | null {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve("hyperframes/package.json");
    const pkg = require(pkgPath) as { version: string; bin: Record<string, string> | string };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.hyperframes;
    return bin ? { entry: join(dirname(pkgPath), bin), version: pkg.version } : null;
  } catch {
    return null;
  }
}

export function gsapPath(): string | null {
  try {
    const require = createRequire(import.meta.url);
    return join(dirname(require.resolve("gsap/package.json")), "dist", "gsap.min.js");
  } catch {
    return null;
  }
}

/** Chrome the renderer will use: explicit env path, else HyperFrames' cached download. */
export async function chromePath(): Promise<string | null> {
  for (const v of [process.env.PRODUCER_HEADLESS_SHELL_PATH, process.env.HYPERFRAMES_BROWSER_PATH]) {
    if (v?.trim()) {
      try {
        await access(v.trim(), constants.X_OK);
        return v.trim();
      } catch {
        return null;
      }
    }
  }
  const cache = join(homedir(), ".cache", "hyperframes", "chrome");
  try {
    return (await readdir(cache)).length ? cache : null;
  } catch {
    return null;
  }
}

export const HF_ENV: NodeJS.ProcessEnv = {
  HYPERFRAMES_NO_TELEMETRY: "1",
  HYPERFRAMES_NO_UPDATE_CHECK: "1",
  HYPERFRAMES_SKIP_SKILLS: "1",
  DO_NOT_TRACK: "1",
};

export interface RenderProgress {
  /** 0-100, monotonic. */
  pct: number;
  frame?: number;
  total?: number;
  stage: string;
}

/** Parse one (ANSI-stripped or raw) HyperFrames progress line: "  ███░░  56%  Capturing frame 100/180 (6 workers)". */
export function parseHfProgress(raw: string): RenderProgress | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes
  const line = raw.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  const m = /(\d{1,3})%\s+(.+?)\s*$/.exec(line);
  if (!m?.[1] || !m[2]) return null;
  const pct = Math.min(100, Number(m[1]));
  const stage = m[2];
  const f = /frame (\d+)\/(\d+)/i.exec(stage);
  return f?.[1] && f[2] ? { pct, stage, frame: Number(f[1]), total: Number(f[2]) } : { pct, stage };
}

/** CPU quota of this container (cgroup v2 cpu.max), else os cpus. */
export function cpuQuota(cpuMax: string | null, fallback: number): number {
  const m = cpuMax ? /^(\d+)\s+(\d+)/.exec(cpuMax.trim()) : null;
  return m?.[1] && m[2] ? Math.max(1, Math.floor(Number(m[1]) / Number(m[2]))) : Math.max(1, fallback);
}

/** Explicit Chrome workers: HF_RENDER_WORKERS, else quota / expected concurrent renders, clamped 2-6. */
export function renderWorkers(env: NodeJS.ProcessEnv, cpus: number): number {
  const o = Number(env.HF_RENDER_WORKERS);
  if (o >= 1) return Math.floor(o);
  const conc = Math.max(1, Number(env.HF_RENDER_CONCURRENCY) || 4);
  return Math.min(6, Math.max(2, Math.floor(cpus / conc)));
}

async function detectCpus(): Promise<number> {
  const { readFile } = await import("node:fs/promises");
  const { availableParallelism } = await import("node:os");
  const raw = await readFile("/sys/fs/cgroup/cpu.max", "utf8").catch(() => null);
  return cpuQuota(raw, availableParallelism());
}

export type RenderQuality = "draft" | "standard" | "looks" | "delivery";
export interface RenderOptions {
  fps: number;
  workers?: number;
  quality?: RenderQuality;
  /** fast = plain hf render; quality = the registered quality renderer (motion blur), else fast. */
  mode?: "fast" | "quality";
  onProgress?: (p: RenderProgress) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}
export type QualityRenderer = (projectDir: string, output: string, opts: RenderOptions) => Promise<RunResult>;
const qualityRenderers: QualityRenderer[] = [];
/** The quality-render module registers itself here (keeps runtime free of a cyclic import). */
export function registerQualityRenderer(fn: QualityRenderer | null): void {
  qualityRenderers.length = 0;
  if (fn) qualityRenderers.push(fn);
}

/**
 * One gate for every HyperFrames render in this process (ad motion, Studio, quality). Worker counts already assume
 * HF_RENDER_CONCURRENCY renders at once; without the gate a burst launched more Chrome instances than the box could
 * start ("Failed to start BrowserThread:IO") and a Studio video was lost.
 */
let renderGate: Limiter | null = null;
export function renderGateFor(env: NodeJS.ProcessEnv = process.env): Limiter {
  renderGate ??= new Limiter({ maxConcurrent: Math.max(1, Number(env.HF_RENDER_CONCURRENCY) || 4), maxPerWindow: 1_000_000, windowMs: 60_000 });
  return renderGate;
}

export async function renderComposition(projectDir: string, output: string, opts: RenderOptions): Promise<RunResult> {
  const q = qualityRenderers[0];
  if (opts.mode === "quality" && q) return q(projectDir, output, { ...opts, mode: "fast" });
  const hf = hyperframesEntry();
  if (!hf) return { code: -1, stdout: "", stderr: "hyperframes not installed", ms: 0 };
  const envQ = process.env.HF_RENDER_QUALITY;
  const quality = (["draft", "standard", "looks", "delivery"].includes(envQ ?? "") ? envQ : opts.quality) ?? "standard";
  const workers = opts.workers ?? renderWorkers(process.env, await detectCpus());
  const args = [hf.entry, "render", projectDir, "--output", output, "--fps", String(opts.fps), "--quality", quality, "--workers", String(workers)];
  let last = -1;
  const onChunk = opts.onProgress
    ? (chunk: string) => {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escapes split progress redraws
        for (const part of chunk.split(/\x1b\[[0-9;?]*[A-Za-z]|[\r\n]/)) {
          const p = parseHfProgress(part);
          if (p && p.pct >= last) {
            last = p.pct;
            opts.onProgress?.(p);
          }
        }
      }
    : undefined;
  if (opts.signal?.aborted) return { code: -1, stdout: "", stderr: "aborted", ms: 0 };
  return renderGateFor().run(() => run(process.execPath, args, { signal: opts.signal, env: HF_ENV, timeoutMs: opts.timeoutMs ?? 240_000, onChunk }), opts.signal);
}

export interface ProbeInfo {
  codec: string;
  pixFmt: string;
  width: number;
  height: number;
  durationSec: number;
}

export async function probe(file: string, signal?: AbortSignal): Promise<ProbeInfo | null> {
  const fp = await ffprobePath();
  if (!fp) return null;
  const r = await run(fp, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,width,height:format=duration", "-of", "json", file], { signal });
  if (r.code !== 0) return null;
  const j = JSON.parse(r.stdout) as { streams?: Array<{ codec_name: string; pix_fmt: string; width: number; height: number }>; format?: { duration?: string } };
  const s = j.streams?.[0];
  return s ? { codec: s.codec_name, pixFmt: s.pix_fmt, width: s.width, height: s.height, durationSec: Number(j.format?.duration ?? 0) } : null;
}

/** H.264 yuv420p + faststart, re-encoding only when needed or when the file is too big. */
export async function finalizeMp4(input: string, output: string, maxBytes: number, signal?: AbortSignal): Promise<{ ok: boolean; reencoded: boolean; error?: string }> {
  const ff = await ffmpegPath();
  if (!ff) return { ok: false, reencoded: false, error: "ffmpeg missing" };
  const info = await probe(input, signal);
  const size = (await stat(input)).size;
  const copyOk = info?.codec === "h264" && info.pixFmt === "yuv420p" && size < maxBytes;
  const v = copyOk ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "medium", "-crf", size < maxBytes ? "20" : "26", "-pix_fmt", "yuv420p", "-profile:v", "high"];
  const r = await run(ff, ["-y", "-v", "error", "-i", input, ...v, "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output], { signal });
  return r.code === 0 ? { ok: true, reencoded: !copyOk } : { ok: false, reencoded: !copyOk, error: r.stderr.slice(-500) };
}

export async function extractFrame(video: string, atSec: number, out: string, signal?: AbortSignal): Promise<boolean> {
  const ff = await ffmpegPath();
  if (!ff) return false;
  const r = await run(ff, ["-y", "-v", "error", "-ss", String(atSec), "-i", video, "-frames:v", "1", "-q:v", "2", out], { signal });
  return r.code === 0;
}

export interface FlashReport {
  ok: boolean;
  raw: unknown;
}

/** EZ Motion's WCAG 2.3.1 flash screen (vendored flash-check.mjs). */
export async function flashCheck(video: string, signal?: AbortSignal): Promise<FlashReport> {
  const r = await run(process.execPath, [join(VENDOR_DIR, "bin", "flash-check.mjs"), video], { signal });
  const line = r.stdout.trim().split("\n").pop() ?? "";
  try {
    const raw = JSON.parse(line) as { ok?: boolean };
    return { ok: r.code === 0 && raw.ok === true, raw };
  } catch {
    return { ok: false, raw: { error: r.stderr.slice(-400) || "flash-check produced no report" } };
  }
}

export function execOk(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 10_000 }, (err) => resolve(!err)));
}

/** Beat-locked music + sound effects from a score (vendored EZ Motion score-synth, offline, deterministic). */
export async function synthScore(score: Record<string, unknown>, outDir: string, signal?: AbortSignal): Promise<{ ok: boolean; music?: string; sfx?: string; error?: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, "score.json");
  await writeFile(file, JSON.stringify(score));
  const r = await run(process.execPath, [join(VENDOR_DIR, "bin", "score-synth.mjs"), file, outDir], { signal, timeoutMs: 60_000 });
  if (r.code !== 0) return { ok: false, error: (r.stderr || r.stdout).slice(-400) };
  return { ok: true, music: join(outDir, "music.wav"), sfx: join(outDir, "sfx.wav") };
}

/** Lay music + sfx under a silent render at feed loudness (-14 LUFS, limited), video stream copied. */
export async function muxAudio(video: string, music: string, sfx: string, output: string, signal?: AbortSignal): Promise<{ ok: boolean; error?: string }> {
  const ff = await ffmpegPath();
  if (!ff) return { ok: false, error: "ffmpeg missing" };
  const filter = "[1:a]volume=0.85[m];[2:a]volume=1.0[s];[m][s]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.8:level=false[a]";
  const r = await run(ff, ["-y", "-v", "error", "-i", video, "-i", music, "-i", sfx, "-filter_complex", filter, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", output], { signal });
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.slice(-500) };
}

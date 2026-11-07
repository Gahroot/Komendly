// Process helpers: HyperFrames CLI, ffmpeg/ffprobe, flash check. All local, no downloads.
import { execFile, spawn } from "node:child_process";
import { access, constants, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { VENDOR_DIR } from "./fonts";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

export function run(cmd: string, args: string[], opts: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, signal: opts.signal, timeout: opts.timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
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

export async function renderComposition(projectDir: string, output: string, opts: { fps: number; workers?: number; signal?: AbortSignal; timeoutMs?: number }): Promise<RunResult> {
  const hf = hyperframesEntry();
  if (!hf) return { code: -1, stdout: "", stderr: "hyperframes not installed", ms: 0 };
  const args = [hf.entry, "render", projectDir, "--output", output, "--fps", String(opts.fps), "--quality", "standard", "--quiet"];
  if (opts.workers) args.push("--workers", String(opts.workers));
  return run(process.execPath, args, { signal: opts.signal, env: HF_ENV, timeoutMs: opts.timeoutMs ?? 240_000 });
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

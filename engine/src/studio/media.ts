// Ozzy Studio media helpers: probe, poster, ratio, watermark (sharp PNG + ffmpeg overlay; no drawtext needed).
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { STUDIO_WATERMARK } from "../../../src/lib/studio/contracts";
import { ffmpegPath, ffprobePath, run } from "../modules/ezmotion/runtime";

export interface MediaInfo {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export async function probeMedia(file: string, signal?: AbortSignal): Promise<MediaInfo | null> {
  const fp = await ffprobePath();
  if (!fp) return null;
  const r = await run(fp, ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file], { signal });
  if (r.code !== 0) return null;
  const j = JSON.parse(r.stdout) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }>; format?: { duration?: string } };
  const v = j.streams?.find((s) => s.codec_type === "video");
  const d = Number(j.format?.duration);
  return { durationSec: Number.isFinite(d) && d > 0 ? d : null, width: v?.width ?? null, height: v?.height ?? null, hasVideo: !!v, hasAudio: !!j.streams?.some((s) => s.codec_type === "audio") };
}

/** Nearest delivery ratio label for a frame size. */
export function ratioOf(width: number, height: number): string {
  const r = width / Math.max(1, height);
  const opts: Array<[string, number]> = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9]];
  return opts.reduce((best, o) => (Math.abs(Math.log(o[1] / r)) < Math.abs(Math.log(best[1] / r)) ? o : best))[0];
}

/** Poster: first non-black frame among a few early timestamps. */
export async function posterFrame(video: string, out: string, durationSec: number | null, signal?: AbortSignal): Promise<boolean> {
  const ff = await ffmpegPath();
  if (!ff) return false;
  const d = durationSec ?? 1;
  for (const t of [Math.min(0.5, d / 4), d * 0.2, d * 0.5, 0]) {
    const r = await run(ff, ["-y", "-v", "error", "-ss", t.toFixed(2), "-i", video, "-frames:v", "1", "-vf", "scale='min(1080,iw)':-2", "-q:v", "3", out], { signal });
    if (r.code !== 0) continue;
    const st = await sharp(out).stats().catch(() => null);
    const mean = st ? st.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3 : 0;
    if (mean > 12 || t === 0) return true;
  }
  return false;
}

export interface WatermarkGeometry {
  /** Watermark PNG size. */
  width: number;
  height: number;
  /** Offset from the right/bottom edges (safe area). */
  marginX: number;
  marginY: number;
}

/** Small and bottom-right; tall frames keep clear of the Reels/TikTok bottom UI band. */
export function watermarkGeometry(videoW: number, videoH: number): WatermarkGeometry {
  const short = Math.min(videoW, videoH);
  const height = Math.max(18, Math.round(short * 0.038));
  const width = Math.round(height * 11);
  const tall = videoH / videoW > 1.5;
  return { width, height, marginX: Math.round(videoW * 0.04), marginY: Math.round(videoH * (tall ? 0.2 : 0.045)) };
}

export async function watermarkPng(g: WatermarkGeometry, out: string, text = STUDIO_WATERMARK): Promise<void> {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const fs = Math.round(g.height * 0.62);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${g.width}" height="${g.height}">
  <rect x="0" y="0" width="${g.width}" height="${g.height}" rx="${Math.round(g.height / 2)}" fill="#000" fill-opacity="0.45"/>
  <text x="${g.width / 2}" y="${g.height / 2}" dominant-baseline="central" text-anchor="middle" font-family="Helvetica, Arial, DejaVu Sans, sans-serif" font-weight="700" font-size="${fs}" fill="#fff" fill-opacity="0.92">${esc}</text>
</svg>`;
  await writeFile(out, await sharp(Buffer.from(svg)).png().toBuffer());
}

/** ffmpeg args: overlay the watermark PNG bottom-right, cap the length, H.264/AAC faststart. */
export function finalArgs(o: { input: string; output: string; maxSeconds: number; watermark?: { png: string; g: WatermarkGeometry }; hasAudio: boolean }): string[] {
  const args = ["-y", "-v", "error", "-i", o.input];
  if (o.watermark) args.push("-i", o.watermark.png);
  args.push("-t", String(o.maxSeconds));
  if (o.watermark) {
    args.push("-filter_complex", `[0:v][1:v]overlay=x=W-w-${o.watermark.g.marginX}:y=H-h-${o.watermark.g.marginY}:format=auto,format=yuv420p[v]`, "-map", "[v]");
  } else {
    args.push("-map", "0:v:0", "-vf", "format=yuv420p");
  }
  if (o.hasAudio) args.push("-map", "0:a:0?", "-c:a", "aac", "-b:a", "160k");
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-movflags", "+faststart", o.output);
  return args;
}

/** Re-encode the delivered video (watermark + length cap). */
export async function finalizeDelivery(o: { input: string; output: string; maxSeconds: number; watermark: boolean; width: number; height: number; hasAudio: boolean; pngPath: string; signal?: AbortSignal }): Promise<{ ok: boolean; error?: string }> {
  const ff = await ffmpegPath();
  if (!ff) return { ok: false, error: "ffmpeg missing" };
  let wm: { png: string; g: WatermarkGeometry } | undefined;
  if (o.watermark) {
    const g = watermarkGeometry(o.width, o.height);
    await watermarkPng(g, o.pngPath);
    wm = { png: o.pngPath, g };
  }
  const r = await run(ff, finalArgs({ input: o.input, output: o.output, maxSeconds: o.maxSeconds, watermark: wm, hasAudio: o.hasAudio }), { signal: o.signal, timeoutMs: 10 * 60_000 });
  return r.code === 0 ? { ok: true } : { ok: false, error: r.stderr.slice(-400) };
}

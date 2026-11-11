// "Shot on iPhone" finish. buildIphoneFinishArgs is pure (unit-tested); run* helpers spawn ffmpeg.
import { spawn } from "node:child_process";

export interface FinishInput {
  path: string;
  /** Seconds; needed for crossfade offsets. */
  duration: number;
}

export interface FinishOptions {
  inputs: readonly FinishInput[];
  output: string;
  width?: number;
  height?: number;
  fps?: number;
  /** Crossfade between chunks (seconds); 0 = butt joins (chunks already cut on pauses). */
  crossfade?: number;
  /** Deterministic phase for the handheld wobble. */
  seed?: number;
  roomTone?: boolean;
  lufs?: number;
  crf?: number;
  /** Synthetic handheld shake amplitude in px (default 1.5; 0 = off). */
  shakePx?: number;
  /** Luma grain strength (default 3; 0 = off). */
  grain?: number;
  /** Unsharp amount (default 0.3; 0 = off). */
  sharpen?: number;
  /** Cut the output to at most this many seconds (drops padding added for short audio). */
  trimTo?: number;
  /** Loudness-normalize each input before joining (takes from separate generations). */
  normalizeEach?: boolean;
}

const f3 = (n: number) => (Math.round(n * 1000) / 1000).toString();

export function finishedDuration(inputs: readonly FinishInput[], crossfade: number): number {
  const sum = inputs.reduce((a, i) => a + i.duration, 0);
  return Math.max(0, sum - crossfade * Math.max(0, inputs.length - 1));
}

export function buildIphoneFinishArgs(o: FinishOptions): string[] {
  if (o.inputs.length === 0) throw new Error("no inputs");
  const W = o.width ?? 1080;
  const H = o.height ?? 1920;
  const fps = o.fps ?? 30;
  const minDur = Math.min(...o.inputs.map((i) => i.duration));
  const xf = Math.min(o.crossfade ?? 0.12, minDur / 3);
  const seed = o.seed ?? 0;
  const joined = finishedDuration(o.inputs, xf);
  const total = o.trimTo && o.trimTo > 0 ? Math.min(joined, o.trimTo) : joined;
  const args = ["-hide_banner", "-y"];
  for (const i of o.inputs) args.push("-i", i.path);
  const n = o.inputs.length;
  const roomTone = o.roomTone ?? true;
  if (roomTone) args.push("-f", "lavfi", "-t", f3(total + 0.5), "-i", "anoisesrc=color=brown:amplitude=0.0025:sample_rate=48000:seed=" + String(seed));

  const fc: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = f3(o.inputs[i]?.duration ?? 0);
    fc.push(`[${i}:v]trim=duration=${d},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},setsar=1,format=yuv420p,settb=AVTB[v${i}]`);
    fc.push(`[${i}:a]atrim=duration=${d},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS${o.normalizeEach ? `,loudnorm=I=${o.lufs ?? -16}:TP=-1.5:LRA=11,aresample=48000` : ""}[a${i}]`);
  }
  let v = "v0";
  let a = "a0";
  let offset = 0;
  for (let i = 1; i < n; i++) {
    offset += (o.inputs[i - 1]?.duration ?? 0) - xf;
    if (xf > 0) {
      fc.push(`[${v}][v${i}]xfade=transition=fade:duration=${f3(xf)}:offset=${f3(offset)}[vx${i}]`);
      fc.push(`[${a}][a${i}]acrossfade=d=${f3(xf)}:c1=tri:c2=tri[ax${i}]`);
    } else {
      fc.push(`[${v}][v${i}]concat=n=2:v=1:a=0[vx${i}]`);
      fc.push(`[${a}][a${i}]concat=n=2:v=0:a=1[ax${i}]`);
    }
    v = `vx${i}`;
    a = `ax${i}`;
  }
  // Handheld micro-motion (tiny overscan + slow incommensurate sines), phone-like temporal sensor
  // grain and mild sharpening. Kept subtle: avatar models already add their own camera motion.
  const shake = o.shakePx ?? 1.5;
  const grain = o.grain ?? 3;
  const sharpen = o.sharpen ?? 0.3;
  const post: string[] = [];
  if (shake > 0) {
    const m = Math.ceil(shake * 2) + 2;
    const p = (seed % 97) / 7;
    const ox = `${m}+${f3(shake * 0.6)}*sin(t*1.3+${f3(p)})+${f3(shake * 0.4)}*sin(t*0.53+${f3(p * 2)})`;
    const oy = `${m}+${f3(shake * 0.6)}*sin(t*1.07+${f3(p * 3)})+${f3(shake * 0.4)}*sin(t*0.41)`;
    post.push(`scale=${W + 2 * m}:${H + 2 * m}`, `crop=${W}:${H}:x='${ox}':y='${oy}'`);
  }
  if (grain > 0) {
    const c = Math.max(1, Math.round(grain / 2.5));
    post.push(`noise=c0s=${f3(grain)}:c0f=t+u:c1s=${c}:c1f=t+u:c2s=${c}:c2f=t+u`);
  }
  if (sharpen > 0) post.push(`unsharp=5:5:${f3(sharpen)}:3:3:0`);
  post.push("format=yuv420p");
  fc.push(`[${v}]${post.join(",")}[vout]`);
  const lufs = o.lufs ?? -16;
  if (roomTone) {
    fc.push(`[${a}][${n}:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=${lufs}:TP=-1.5:LRA=11,aresample=48000[aout]`);
  } else {
    fc.push(`[${a}]loudnorm=I=${lufs}:TP=-1.5:LRA=11,aresample=48000[aout]`);
  }
  args.push("-filter_complex", fc.join(";"), "-map", "[vout]", "-map", "[aout]");
  args.push(
    "-c:v", "libx264", "-profile:v", "high", "-level", "4.1", "-preset", "medium", "-crf", String(o.crf ?? 19),
    "-pix_fmt", "yuv420p", "-r", String(fps), "-g", String(fps * 2),
    // No x264 settings SEI (encoder fingerprint) in the bitstream.
    "-bsf:v", "filter_units=remove_types=6",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    // Strip container/stream metadata (encoder tags, any "AI generated"/C2PA-ish tags from inputs).
    "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
    "-metadata:s:v", "handler_name=Core Media Video", "-metadata:s:a", "handler_name=Core Media Audio",
    "-movflags", "+faststart", "-shortest", "-t", f3(total),
    o.output,
  );
  return args;
}

/** Hard-cut join of sub-takes from one model (same size), each trimmed to its duration. */
export function concatArgs(inputs: readonly FinishInput[], output: string): string[] {
  if (inputs.length === 0) throw new Error("no inputs");
  const args = ["-hide_banner", "-y"];
  for (const i of inputs) args.push("-i", i.path);
  const fc: string[] = [];
  let pairs = "";
  inputs.forEach((inp, i) => {
    const d = f3(inp.duration);
    fc.push(`[${i}:v]trim=duration=${d},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[v${i}]`);
    fc.push(`[${i}:a]atrim=duration=${d},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
    pairs += `[v${i}][a${i}]`;
  });
  fc.push(`${pairs}concat=n=${inputs.length}:v=1:a=1[v][a]`);
  args.push("-filter_complex", fc.join(";"), "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", output);
  return args;
}

export function silenceDetectArgs(input: string, noiseDb = -32, minSilence = 0.25): string[] {
  return ["-hide_banner", "-nostats", "-i", input, "-af", `silencedetect=noise=${noiseDb}dB:d=${minSilence}`, "-f", "null", "-"];
}

/** Pad audio with trailing silence to `seconds` (avatar models reject very short audio). */
export function padAudioArgs(input: string, seconds: number, output: string): string[] {
  return ["-hide_banner", "-y", "-i", input, "-af", `apad=whole_dur=${f3(seconds)}`, "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", output];
}

export function sliceAudioArgs(input: string, start: number, end: number, output: string): string[] {
  return ["-hide_banner", "-y", "-i", input, "-ss", f3(start), "-to", f3(end), "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", output];
}

export function runBinary(bin: string, args: readonly string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { signal, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    p.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-1500)}`))));
  });
}

export const runFfmpeg = (args: readonly string[], signal?: AbortSignal) => runBinary(process.env.FFMPEG_PATH || "ffmpeg", args, signal);

export async function probeDuration(path: string, signal?: AbortSignal): Promise<number> {
  const { stdout } = await runBinary(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], signal);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d)) throw new Error(`ffprobe: bad duration for ${path}`);
  return d;
}

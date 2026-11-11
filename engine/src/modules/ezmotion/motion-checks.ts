// Post-render motion checks (ffmpeg): frozen stretches (freezedetect) and scene changes vs the music's beats.
// Parsers are pure (tested on real ffmpeg output); analyzeMotion never throws.
import { readFile } from "node:fs/promises";
import { ffmpegPath, ffprobePath, run } from "./runtime";

export interface Freeze { start: number; end: number }
export interface MotionReport {
  checked: boolean;
  duration: number;
  /** Freezes >= 0.4 s outside the final end-card hold. */
  freezes: Freeze[];
  cuts: number[];
  /** Share of scene changes within 100 ms of a beat; null without beats or cuts. */
  beatOnCut: number | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** freezedetect stderr -> freezes (a freeze still open at EOF ends at `duration`). */
export function parseFreezes(stderr: string, duration: number): Freeze[] {
  const out: Freeze[] = [];
  let open: number | null = null;
  for (const m of stderr.matchAll(/freezedetect\.freeze_(start|end): ([\d.]+)/g)) {
    const t = Number(m[2]);
    if (m[1] === "start") open = t;
    else if (open !== null) { out.push({ start: r3(open), end: r3(t) }); open = null; }
  }
  if (open !== null && duration > open) out.push({ start: r3(open), end: r3(duration) });
  return out;
}

/** showinfo stderr after select='gt(scene,X)' -> scene-change times. */
export function parseSceneTimes(stderr: string): number[] {
  return [...stderr.matchAll(/showinfo.*?\bn:\s*\d+.*?pts_time:([\d.]+)/g)].map((m) => r3(Number(m[1])));
}

/** Freezes outside the end card: anything ending before the last `endHold` seconds (the held logo card). */
export function freezesOutsideEnd(freezes: Freeze[], duration: number, endHold = 2): Freeze[] {
  const endStart = duration - endHold;
  // Adjacent/merged freezes: one that starts inside the end-card window is the hold.
  return freezes.filter((f) => f.start < endStart - 0.05);
}

/** Share of cuts within `tol` s of any beat (0..1); null when either list is empty. */
export function beatAlignment(cuts: number[], beats: number[], tol = 0.1): number | null {
  if (!cuts.length || !beats.length) return null;
  const hit = cuts.filter((c) => beats.some((b) => Math.abs(b - c) <= tol)).length;
  return Math.round((hit / cuts.length) * 100) / 100;
}

/** Beat times (video seconds) from ./brand/music/beats.json ({beats:number[]}). */
export async function readBeats(file: string): Promise<number[]> {
  try {
    const j = JSON.parse(await readFile(file, "utf8")) as { beats?: unknown };
    return Array.isArray(j.beats) ? j.beats.filter((x): x is number => typeof x === "number").sort((a, b) => a - b) : [];
  } catch {
    return [];
  }
}

/** Review text for the agent's one fix turn. */
export function freezeReview(freezes: Freeze[]): string {
  return [
    "The rendered video freezes (no pixel changes for 0.4 s or more) at:",
    ...freezes.slice(0, 10).map((f) => `- ${f.start.toFixed(2)}s to ${f.end.toFixed(2)}s`),
    "Add motion in those stretches (camera drift/push, parallax layers, the hero acting, type wiggle, light sweep, a cut on the next beat). Only the final end card may hold. Keep everything else.",
  ].join("\n");
}

export async function analyzeMotion(file: string, beats: number[], opts: { signal?: AbortSignal; endHold?: number } = {}): Promise<MotionReport> {
  const none: MotionReport = { checked: false, duration: 0, freezes: [], cuts: [], beatOnCut: null };
  try {
    const ff = await ffmpegPath();
    const fp = await ffprobePath();
    if (!ff || !fp) return none;
    const p = await run(fp, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { signal: opts.signal });
    const duration = Number(p.stdout.trim()) || 0;
    const fz = await run(ff, ["-hide_banner", "-nostats", "-i", file, "-map", "0:v", "-vf", "freezedetect=n=0.003:d=0.4", "-f", "null", "-"], { signal: opts.signal, timeoutMs: 3 * 60_000 });
    const sc = await run(ff, ["-hide_banner", "-nostats", "-i", file, "-map", "0:v", "-vf", "select='gt(scene,0.12)',showinfo", "-f", "null", "-"], { signal: opts.signal, timeoutMs: 3 * 60_000 });
    if (fz.code !== 0 || sc.code !== 0) return none;
    const cuts = parseSceneTimes(sc.stderr);
    return { checked: true, duration, freezes: freezesOutsideEnd(parseFreezes(fz.stderr, duration), duration, opts.endHold), cuts, beatOnCut: beatAlignment(cuts, beats) };
  } catch {
    return none;
  }
}

/** QC check from render meta (visualBrief.render.motion), after the agent's freeze fix turn: fails on 2+ freezes left or beat-on-cut < 30%. */
export function motionCheck(visualBrief: unknown): { name: string; pass: boolean; detail?: string } | null {
  const m = (visualBrief as { render?: { motion?: Partial<MotionReport> } } | null)?.render?.motion;
  if (!m || m.checked !== true) return null;
  const freezes = Array.isArray(m.freezes) ? m.freezes : [];
  const beat = typeof m.beatOnCut === "number" ? m.beatOnCut : null;
  const lowBeat = beat !== null && beat < 0.3;
  const parts = [
    `freezes ${freezes.length}${freezes.length ? ` (${freezes.slice(0, 5).map((f) => `${f.start.toFixed(1)}-${f.end.toFixed(1)}s`).join(", ")})` : ""}`,
    `beat-on-cut ${beat === null ? "n/a" : `${Math.round(beat * 100)}%`}`,
    `cuts ${Array.isArray(m.cuts) ? m.cuts.length : 0}`,
  ];
  return { name: "motion_freeze_beat", pass: freezes.length <= 1 && !lowBeat, detail: parts.join("; ") };
}

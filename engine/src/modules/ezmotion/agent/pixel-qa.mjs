// Ozzy Studio pixel QA: measure the video the way a motion designer reviews it, and turn the numbers into plain fix
// instructions for the agent. Three measurements:
//  - motion: a fast low-fps draft render of the composition, decoded to a tiny grey grid. Long stretches where nothing
//    visibly moves, a dead first 1.5 s (no hook), and scene lengths (cuts) for pacing.
//  - phone readability: the composition loaded in Chromium with the HyperFrames runtime, seeked to sample times, and
//    every visible text measured (font size x on-screen scale), against sizes scaled to the composition width.
//  - flashing (final render, see studio/turn.ts): WCAG 2.3.1 windows from the vendored flash check -> soften prompt.
// Ideas follow the MIT motion checks in the user's own CLI (stillness on decoded pixels, phone-size review).
// Pure helpers are unit-tested (test/studio-pixel-qa.test.ts); every tool step returns null on failure (never blocks).
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ---------- motion (pure) ----------

/** Analysis grid: the short side of the frame in grid pixels. */
export const GRID_SHORT = 160;
/** Frames per second sampled from the draft (and from finals when checked offline). */
export const MOTION_FPS = 5;
/** A grid pixel moved visibly when its grey level changes by more than this (encoder noise stays below). */
export const MOVE_LEVEL = 10;
/** A window is still when at most this share of the grid moved visibly (about 20 grid pixels at 160x284). */
export const STILL_SHARE = 0.0015;
/** Compare frames this far apart (s): slow pushes and drifts add up and read as motion, as a viewer sees them. */
export const STILL_LAG = 0.6;
/** Longest allowed stretch with nothing moving (s): the ~1.5 s rule plus a 0.5 s reading allowance (a held quote or
 * price on good finals measures exactly 2.0 s). The end card may hold up to END_HOLD at the very end. */
export const MAX_STILL = 2;
export const END_HOLD = 4;
/** A frame step that changes this share of the grid is a cut (or the heart of a fast transition). */
export const CUT_SHARE = 0.35;
/** The first seconds that must carry a hook, and the visible change that counts as a real hook move. */
export const HOOK_SECONDS = 1.5;
export const HOOK_SHARE = 0.01;
/** "Held": a 1 s window where every frame step changes less than this share of the grid. A slow zoom or drift on a
 * photo stays under it, which is how viewers see it (bench: held share tracks judged "life" at r = -0.82). */
export const HELD_SHARE = 0.02;
export const HELD_WINDOW = 1;
/** Longest allowed held stretch mid-video (s), the end card's allowance, and the most of the video that may be held. */
export const MAX_HELD = 2;
export const END_HELD = 3.5;
export const MAX_HELD_SHARE = 0.15;

/** Held stretches (> maxHeld s, not the end card) and the held share of the body (end card excluded). */
/** Share of 0.2 s steps where something visibly moves (> HELD_SHARE of the grid changes). Frontier-made ads measure
 * 0.66-1.0 (median ~0.85); videos judged lifeless sit around 0.4-0.6. */
export const MIN_ACTIVITY = 0.75;
export function activity(step, share = HELD_SHARE) {
  if (!step?.length) return null;
  return Math.round((step.filter((x) => x > share).length / step.length) * 100) / 100;
}

export function heldReport(step, { fps = MOTION_FPS, duration = 0, share = HELD_SHARE, windowSec = HELD_WINDOW, maxHeld = MAX_HELD, endHeld = END_HELD } = {}) {
  const total = duration > 0 ? duration : (step.length + 1) / fps;
  const win = Math.max(1, Math.round(windowSec * fps));
  const flags = [];
  for (let i = 0; i + win <= step.length; i++) flags.push(Math.max(...step.slice(i, i + win)) < share);
  const stretches = [];
  let from = -1, heldFrames = 0;
  const bodyEnd = Math.max(0, total - endHeld);
  const close = (end) => {
    const start = from / fps, stop = Math.min(total, (end + win) / fps);
    from = -1;
    const endCard = stop >= total - 1.5 / fps && start >= bodyEnd - 1e-9;
    if (!endCard && stop - start > maxHeld + 1e-9) stretches.push({ start: r1(start), end: r1(stop), seconds: r1(stop - start) });
  };
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] && i / fps < bodyEnd) heldFrames++;
    if (flags[i]) { if (from < 0) from = i; } else if (from >= 0) close(i - 1);
  }
  if (from >= 0) close(flags.length - 1);
  const bodyFrames = Math.max(1, Math.min(flags.length, Math.round(bodyEnd * fps)));
  return { stretches, share: Math.round((heldFrames / bodyFrames) * 100) / 100 };
}

/** Share of pixels (of two equal grey frames) whose level differs by more than `level`. */
export function changedShare(a, b, level = MOVE_LEVEL) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let c = 0;
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) > level) c++;
  return c / n;
}

/** Split a raw grey buffer into frames of `w*h` bytes. */
export function splitFrames(buf, w, h) {
  const size = w * h;
  const out = [];
  for (let o = 0; size > 0 && o + size <= buf.length; o += size) out.push(buf.subarray(o, o + size));
  return out;
}

/** Per-frame motion numbers: `step[i]` = change from frame i to i+1, `lag[i]` = change from frame i to i+lagFrames. */
export function motionSeries(frames, fps = MOTION_FPS, lagSec = STILL_LAG) {
  const k = Math.max(1, Math.round(lagSec * fps));
  const step = [], lag = [];
  for (let i = 0; i + 1 < frames.length; i++) step.push(changedShare(frames[i], frames[i + 1]));
  for (let i = 0; i + k < frames.length; i++) lag.push(changedShare(frames[i], frames[i + k]));
  return { step, lag, lagFrames: k };
}

const r1 = (n) => Math.round(n * 10) / 10;

/** Still stretches longer than `maxStill` s. Frame i is still when nothing moved between it and the frame `lagFrames`
 * later; a run of still frames i..j covers [i/fps, (j+lagFrames)/fps]. A run that reaches the end of the video is the
 * end card: allowed while it starts in the last `endHold` seconds. */
export function stillStretches(lag, { fps = MOTION_FPS, lagFrames = 3, duration = 0, maxStill = MAX_STILL, endHold = END_HOLD, share = STILL_SHARE } = {}) {
  const total = duration > 0 ? duration : (lag.length + lagFrames) / fps;
  const out = [];
  let from = -1;
  const close = (end) => {
    const start = from / fps;
    const stop = Math.min(total, (end + lagFrames) / fps);
    from = -1;
    if (stop - start <= maxStill + 1e-9) return;
    const atEnd = stop >= total - 1.5 / fps;
    if (atEnd && start >= total - endHold - 1e-9) return;
    out.push({ start: r1(start), end: r1(stop), seconds: r1(stop - start), endCard: atEnd });
  };
  for (let i = 0; i < lag.length; i++) {
    if (lag[i] <= share) { if (from < 0) from = i; }
    else if (from >= 0) close(i - 1);
  }
  if (from >= 0) close(lag.length - 1);
  return out;
}

/** Cut times (s) from frame-step changes; steps within 0.4 s of each other are one cut (a fast transition). */
export function cutTimes(step, fps = MOTION_FPS, share = CUT_SHARE) {
  const out = [];
  for (let i = 0; i < step.length; i++) {
    if (step[i] < share) continue;
    const t = (i + 1) / fps;
    if (out.length && t - out[out.length - 1] <= 0.4 + 1e-9) continue;
    out.push(r1(t));
  }
  return out;
}

/** Pacing from cuts: scene lengths, metronomic (4+ scenes, all within 12% of the mean length), longest scene. */
export function pacing(cuts, duration) {
  const edges = [0, ...cuts.filter((c) => c > 0.3 && c < duration - 0.3), duration];
  const scenes = [];
  for (let i = 1; i < edges.length; i++) scenes.push(r1(edges[i] - edges[i - 1]));
  const body = scenes.length > 2 ? scenes.slice(0, -1) : scenes; // the end card may hold longer
  const mean = body.reduce((s, x) => s + x, 0) / Math.max(1, body.length);
  const spread = body.length ? Math.max(...body) - Math.min(...body) : 0;
  return { scenes, metronomic: body.length >= 4 && mean > 0 && spread <= 0.12 * mean, longest: scenes.length ? Math.max(...scenes) : 0 };
}

/** Hook in the first `seconds`: the biggest visible change there. dead = nothing moves at all; weak = barely moves. */
export function hook(step, lag, fps = MOTION_FPS, seconds = HOOK_SECONDS) {
  const n = Math.max(1, Math.round(seconds * fps));
  const peak = Math.max(0, ...step.slice(0, n), ...lag.slice(0, Math.max(1, n - 2)));
  return { peak: Math.round(peak * 1000) / 1000, dead: peak <= STILL_SHARE, weak: peak < HOOK_SHARE };
}

/** All motion numbers for a decoded video. */
export function motionReport(frames, { fps = MOTION_FPS, duration = 0 } = {}) {
  const d = duration > 0 ? duration : frames.length / fps;
  const { step, lag, lagFrames } = motionSeries(frames, fps);
  const cuts = cutTimes(step, fps);
  return { duration: r1(d), still: stillStretches(lag, { fps, lagFrames, duration: d }), held: heldReport(step, { fps, duration: d }), hook: hook(step, lag, fps), cuts, pacing: pacing(cuts, d), activity: fps === MOTION_FPS ? activity(step) : null };
}

// ---------- phone readability (pure) ----------

/** Sizes in px on a 1080-wide frame. body: comfortable on a phone (smaller is advisory). sentence: a line of 4+ words
 * below this is a defect (about 13 pt on a phone). headline: the biggest words of a frame. Anything under half of
 * body is a defect whatever it says (except a bare URL in a mock browser bar). */
export const MIN_TEXT_1080 = 42;
export const MIN_SENTENCE_1080 = 36;
export const MIN_HEADLINE_1080 = 90;
const FINE_PRINT = /\b(terms|conditions|apply|copyright|rights reserved|disclaimer|licen[cs]e|privacy)\b|©|®|™/i;

/** Thresholds for a composition size. Portrait and square fill a phone's width, so sizes scale with the width.
 * Landscape is mostly watched full-screen or on a bigger screen, so it scales with the frame's geometric size
 * (1920x1080 -> x1.33 rather than x1.78). */
export function textThresholds(width, height = width) {
  const w = width > 0 ? width : 1080, h = height > 0 ? height : w;
  const k = w > h ? Math.sqrt(w * h) / 1080 : w / 1080;
  return { body: Math.round(MIN_TEXT_1080 * k), sentence: Math.round(MIN_SENTENCE_1080 * k), headline: Math.round(MIN_HEADLINE_1080 * k) };
}

/** Small text from DOM samples [{t, items:[{text, px}]}] (items already visible, on screen, opaque).
 * small: texts below the body size seen at 2+ sample times (a word scaling in doesn't count).
 * smallHeadline: sample times with text but nothing headline-sized, when that's 3+ times and 30%+ of them.
 * defect: a sentence (4+ words) below the sentence size, any text below half the body size, or weak headlines.
 * Everything else below body size (eyebrows, tags, short labels) is advisory: the kit starters use 24-35 px labels. */
export function readability(samples, { width = 1080, height = width } = {}) {
  const th = textThresholds(width, height);
  const seen = new Map();
  const weakTimes = [];
  let withText = 0;
  for (const s of samples || []) {
    const all = (s.items || []).filter((i) => /[\p{L}\p{N}]/u.test(String(i.text ?? "")));
    const items = all.filter((i) => String(i.text).replace(/[^\p{L}\p{N}]/gu, "").length >= 3);
    if (!all.length) continue;
    withText++;
    // Numbers and prices ("40", "$30") count as headlines.
    if (Math.max(...all.map((i) => Number(i.px) || 0)) < th.headline) weakTimes.push(s.t);
    for (const i of items) {
      const text = String(i.text).replace(/\s+/g, " ").trim();
      if (!(Number(i.px) < th.body) || FINE_PRINT.test(text)) continue;
      const key = text.slice(0, 60);
      const cur = seen.get(key) ?? { text, times: [], px: Number(i.px) };
      cur.times.push(s.t);
      cur.px = Math.max(cur.px, Number(i.px));
      seen.set(key, cur);
    }
  }
  const small = [...seen.values()].filter((v) => v.times.length >= 2).map((v) => ({ text: v.text.slice(0, 50), px: Math.round(v.px), from: v.times[0], to: v.times[v.times.length - 1] }));
  const smallHeadline = weakTimes.length >= 3 && weakTimes.length >= 0.3 * withText ? weakTimes : [];
  const words = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const bareUrl = (t) => /^\S+\.[a-z]{2,}(\/\S*)?$/i.test(t);
  // Phone viewers can't read UI copy, chat lines or captions under the sentence size: 2+ words below it is a defect, and so
  // is any word under 70% of the body size (a URL in a mock browser bar may be smaller).
  for (const s of small) s.severe = (words(s.text) >= 2 && s.px < th.sentence && !bareUrl(s.text)) || (s.px < th.body * 0.7 && !bareUrl(s.text)) || s.px < th.body / 2;
  const defect = small.some((s) => s.severe) || smallHeadline.length > 0;
  return { thresholds: th, small: small.slice(0, 8), smallHeadline, defect };
}

// ---------- flashing (pure) ----------

/** Failing windows from a flash-check report (general + red), merged and rounded to whole seconds for the prompt. */
export function flashWindows(raw) {
  const all = [...(raw?.general?.failures ?? []), ...(raw?.red?.failures ?? [])]
    .map((f) => ({ start: Math.max(0, Math.floor(Number(f.start))), end: Math.ceil(Number(f.end)) }))
    .filter((f) => Number.isFinite(f.start) && f.end > f.start)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const f of all) {
    const last = out[out.length - 1];
    if (last && f.start <= last.end) last.end = Math.max(last.end, f.end);
    else out.push({ ...f });
  }
  return out;
}

export function flashFixPrompt(windows) {
  const at = windows.map((w) => `${w.start}-${w.end}s`).join(", ");
  return `[Studio QA, automatic] The finished video FLASHES at ${at}: more than 3 bright/dark (or saturated red) flashes in one second over a large part of the frame. That can trigger seizures and platforms reject it. In index.html, soften exactly those seconds: no strobe or blinking backgrounds, no rapid black/white or colour swaps, no repeated full-frame flash cuts. Keep the energy with movement instead (slides, scale, a single flash at most), or make the change small and low-contrast. Keep everything else the same. Then reply to the user again in one or two plain lines about the video (don't mention this check).`;
}

/** ffmpeg filter that smears brightness swings over ~0.3 s inside the windows (the safety net if a fix round fails). */
export function softenFilter(windows) {
  const on = windows.map((w) => `between(t,${Math.max(0, w.start - 0.5)},${w.end + 0.5})`).join("+");
  return `tmix=frames=9:weights='1 1 1 1 1 1 1 1 1':enable='${on}'`;
}

// ---------- fix prompt parts (pure) ----------

/** Plain fix lines for the measured problems, plus advisory notes (only sent alongside a real defect). */
export function pixelFixParts({ motion = null, text = null } = {}) {
  const defects = [], advice = [];
  if (motion?.failed) defects.push(`- The composition doesn't render: ${motion.failed}. The root element needs data-composition-id="main" (with data-width, data-height, data-duration) and the script must register the paused timeline: window.__timelines = window.__timelines || {}; window.__timelines["main"] = tl. Start from kit/bin/new-video.mjs if in doubt, then check with hf snapshot.`);
  if (motion && !motion.failed) {
    for (const s of motion.still) defects.push(`- Nothing moves from ${s.start}s to ${s.end}s (${s.seconds}s of a frozen picture${s.endCard ? ", the end card holds too long" : ""}). Viewers scroll away from a still frame: give that moment an action (words building, a number counting, the product moving or being used, a cursor tap, a word swap), so no stretch is still for more than ${MAX_STILL}s${s.endCard ? `, and keep the final hold under ${END_HOLD}s` : ""}.`);
    const held = motion.held;
    if (held) {
      const big = held.stretches.filter((h) => !motion.still.some((s) => s.start <= h.start + 0.3 && s.end >= h.end - 0.3));
      if (big.length) defects.push(`- These moments only hold or drift slowly, which reads as a slideshow: ${big.map((h) => `${h.start}s-${h.end}s (${h.seconds}s)`).join(", ")}. Give each one a new beat at least every second: something HAPPENS (a word or line builds or swaps, a number counts up, the product is poured/opened/tapped/assembled, a cursor clicks, a highlight sweeps, an element is carried into the next scene). A slow zoom, drift or parallax on its own does not count. \`node kit/bin/library.mjs search <words>\` has ready techniques (counter-number, word-swap, highlight-sweep, cursor-click, stack-layers, typewriter-caption).`);
      else if (held.share > MAX_HELD_SHARE) defects.push(`- ${Math.round(held.share * 100)}% of the video only holds or drifts slowly (aim for under ${Math.round(MAX_HELD_SHARE * 100)}%). Add more beats inside the scenes: words building, numbers counting, the product in action, carried elements between scenes. A slow zoom on its own does not count.`);
    }
    if (motion.activity !== null && motion.activity !== undefined && motion.activity < MIN_ACTIVITY && !motion.still.length) defects.push(`- Visible motion in only ${Math.round(motion.activity * 100)}% of the video (top motion designers keep something visibly moving ${Math.round(MIN_ACTIVITY * 100)}%+ of the time). Between and during beats, keep the frame alive with motion big enough to see: the mascot or subject bobbing, blinking or reacting, background layers drifting in parallax, large particles or shapes floating, glows pulsing, a ticker or marquee, cards gently swaying; and overlap beats so one move starts before the last ends.`);
    if (motion.hook.dead) defects.push(`- The first ${HOOK_SECONDS}s are completely still: the video has no hook. Start with motion in the first frames (the headline or product moving in, a quick push, a reveal).`);
    else if (motion.hook.weak) advice.push(`- The opening barely moves (under 1% of the frame changes in the first ${HOOK_SECONDS}s). A stronger hook move in the first second would help.`);
    if (motion.pacing.metronomic) advice.push(`- Every scene is the same length (${motion.pacing.scenes.join("s, ")}s): it feels mechanical. Vary the pace: a quick beat or two, and let the key moment breathe longer.`);
  }
  if (text) {
    const { body, headline } = text.thresholds;
    const line = (s) => `  - "${s.text}" is ${s.px}px (${s.from}s${s.to !== s.from ? `-${s.to}s` : ""})`;
    const severe = text.small.filter((s) => s.severe), mild = text.small.filter((s) => !s.severe);
    if (severe.length) defects.push(`- Text too small to read on a phone (the video is watched at phone size, so text needs ${body}px or more on this frame):\n${severe.map(line).join("\n")}\n  Make each of these at least ${body}px (cut words if it no longer fits).`);
    if (mild.length) advice.push(`- Small labels that are hard to read on a phone (${body}px+ reads comfortably):\n${mild.map(line).join("\n")}`);
    if (text.overlaps?.length) defects.push(`- Words drawn on top of other words (often mid-transition: the next line arrives before the last one has left): ${text.overlaps.join("; ")}. Move one out of the way or time the exit before the entrance, so no two texts ever cross.`);
    if (text.clipped?.length) defects.push(`- Cut off by the frame edge: ${text.clipped.join("; ")}. Keep mascots, products and cards fully inside the frame (or clearly full-bleed); don't park them half off-screen.`);
    if (text.empty?.length) defects.push(`- Empty moments: at ${text.empty.map((e) => `${e.start}s-${e.end}s`).join(", ")} nothing readable is on screen (no words, no picture): the stage is cleared before the next beat arrives, or a scene is half-built. Viewers see a blank frame. Overlap the beats: bring the next scene's words/picture in while the last one leaves (a wipe, push or carry), so every moment shows something to read or look at.`);
    if (text.smallHeadline.length) defects.push(`- No headline-size text at ${text.smallHeadline.map((t) => `${t}s`).join(", ")}: the biggest words there are under ${headline}px, which reads as small on a phone. Make each scene's main words at least ${headline}px.`);
  }
  return { defects, advice };
}

// ---------- tools ----------

function run(cmd, args, opts = {}) {
  return new Promise((done) => {
    const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: opts.env ?? process.env });
    const out = [];
    let err = "";
    c.stdout.on("data", (d) => out.push(d));
    c.stderr.on("data", (d) => (err = (err + d.toString()).slice(-2000)));
    const t = setTimeout(() => c.kill("SIGKILL"), opts.timeoutMs ?? 120_000);
    c.on("close", (code) => { clearTimeout(t); done({ code, stdout: Buffer.concat(out), stderr: err }); });
    c.on("error", () => { clearTimeout(t); done({ code: -1, stdout: Buffer.alloc(0), stderr: "spawn failed" }); });
  });
}

function hyperframesPkg() {
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve("hyperframes/package.json");
    const pkg = req(pkgPath);
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.hyperframes;
    return { dir: dirname(pkgPath), entry: join(dirname(pkgPath), bin) };
  } catch {
    return null;
  }
}

/** Composition size and length from the root's data-* attributes. */
export function compositionSize(html) {
  const num = (k) => Number(new RegExp(`data-${k}="([\\d.]+)"`).exec(html)?.[1] ?? 0);
  return { width: num("width") || 1080, height: num("height") || 1920, duration: num("duration") };
}

/** Decode a video to grey frames at `fps` on the analysis grid. */
export async function decodeGrey(video, { fps = MOTION_FPS, ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH || "ffmpeg", width, height } = {}) {
  let w = width, h = height;
  if (!w || !h) {
    const p = await run(ffmpeg.replace(/ffmpeg$/, "ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video], { timeoutMs: 20_000 });
    [w, h] = p.stdout.toString().trim().split(",").map(Number);
    if (!(w > 0 && h > 0)) return null;
  }
  const k = GRID_SHORT / Math.min(w, h);
  const gw = Math.max(2, Math.round((w * k) / 2) * 2), gh = Math.max(2, Math.round((h * k) / 2) * 2);
  const r = await run(ffmpeg, ["-v", "error", "-i", video, "-an", "-vf", `fps=${fps},scale=${gw}:${gh}:flags=area,format=gray`, "-f", "rawvideo", "-"], { timeoutMs: 120_000 });
  if (r.code !== 0 || !r.stdout.length) return null;
  return { frames: splitFrames(r.stdout, gw, gh), w: gw, h: gh };
}

/** Motion numbers for a finished video file (used offline and by the draft check). */
export async function videoMotion(video, { fps = MOTION_FPS, duration = 0 } = {}) {
  const g = await decodeGrey(video, { fps });
  if (!g || g.frames.length < 3) return null;
  return motionReport(g.frames, { fps, duration: duration > 0 ? duration : g.frames.length / fps });
}

/** Draft render of a composition at MOTION_FPS (low quality, a few seconds) -> motion numbers, or null. */
export async function compositionMotion(compDir, { fps = MOTION_FPS } = {}) {
  const hf = hyperframesPkg();
  if (!hf) return null;
  const html = await readFile(join(compDir, "index.html"), "utf8").catch(() => "");
  const { duration } = compositionSize(html);
  const out = await mkdtemp(join(tmpdir(), "ozzy-motion-"));
  try {
    const file = join(out, "draft.mp4");
    const r = await run(process.execPath, [hf.entry, "render", compDir, "--output", file, "--fps", String(fps), "--quality", "draft", "--quiet"], { timeoutMs: 180_000 });
    if (r.code !== 0 || !(await stat(file).catch(() => null))?.size) {
      // A composition the renderer can't even draw is the worst defect of all: report it (timeouts stay silent).
      const err = String(r.stderr || "").match(/HF_[A-Z_]+[^\n]*|Error:[^\n]*/)?.[0];
      return err ? { failed: err.slice(0, 200) } : null;
    }
    return await videoMotion(file, { fps, duration });
  } finally {
    await rm(out, { recursive: true, force: true }).catch(() => undefined);
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf", ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg" };

/** In-page: visible text (text nodes grouped by element) with its on-screen size (font size x transform scale). */
function collectText() {
  const out = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const seen = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName) || el.closest("svg")) continue;
    if (!n.textContent || !n.textContent.trim()) continue;
    seen.add(el);
    let o = 1;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") { o = 0; break; }
      o *= Number(cs.opacity);
    }
    if (o < 0.6) continue;
    const rect = el.getBoundingClientRect();
    const ix = Math.min(rect.right, vw) - Math.max(rect.left, 0), iy = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    if (ix <= 0 || iy <= 0 || ix * iy < 0.5 * rect.width * rect.height) continue;
    const scale = el.offsetHeight > 0 ? rect.height / el.offsetHeight : 1;
    const text = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join(" ").replace(/\s+/g, " ").trim();
    out.push({ text: text.slice(0, 80), px: Math.round(parseFloat(getComputedStyle(el).fontSize) * scale * 10) / 10 });
  }
  return out;
}

/** In-page: what carries the frame right now: the biggest visible text (px) and the share of the frame covered by
 * visible pictures (img, video, canvas, svg, CSS background images). */
function collectContent() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const visible = (el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      o *= Number(cs.opacity);
    }
    return o;
  };
  const area = (r) => Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  let text = 0, pic = 0;
  const boxes = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName) || !/[\p{L}\p{N}]/u.test(n.textContent || "")) continue;
    const r = el.getBoundingClientRect();
    if (!area(r) || visible(el) < 0.6) continue;
    const px = parseFloat(getComputedStyle(el).fontSize) * (el.offsetHeight > 0 ? r.height / el.offsetHeight : 1);
    if (px > text) text = px;
    // Glyph box of the text itself (a Range), not its container: two words drawn on top of each other.
    const rg = document.createRange(); rg.selectNodeContents(n);
    const b = rg.getBoundingClientRect();
    // Line boxes include ascender/descender space; tightly stacked headlines are fine. Compare the ink band only.
    const pad = b.height * 0.22;
    const g = { left: b.left, right: b.right, top: b.top + pad, bottom: b.bottom - pad, width: b.width, height: Math.max(0, b.height - 2 * pad) };
    const words = (n.textContent || "").replace(/\s+/g, " ").trim();
    if (g.width * g.height > 0 && words.replace(/[^\p{L}\p{N}]/gu, "").length >= 3 && px >= 24) boxes.push({ el, g, words: words.slice(0, 40) });
  }
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ix = Math.min(a.g.right, b.g.right) - Math.max(a.g.left, b.g.left), iy = Math.min(a.g.bottom, b.g.bottom) - Math.max(a.g.top, b.g.top);
    if (ix <= 0 || iy <= 0) continue;
    const small = Math.min(a.g.width * a.g.height, b.g.width * b.g.height);
    if ((ix * iy) / small > 0.25) overlaps.push(`"${a.words}" / "${b.words}"`);
  }
  // Pictures cut by the frame edge (a mascot or product half off-screen), not full-bleed backgrounds.
  const clipped = [];
  for (const el of document.querySelectorAll("img, svg, video")) {
    if (el.parentElement?.closest("svg")) continue;
    const r = el.getBoundingClientRect();
    const full = r.width * r.height;
    if (full < 0.02 * vw * vh || full > 0.6 * vw * vh || visible(el) < 0.6) continue;
    const out = 1 - area(r) / full;
    if (out > 0.12 && out < 0.9) clipped.push((el.getAttribute("src") || el.id || el.className?.baseVal || el.className || el.tagName).toString().split("/").pop().slice(0, 40));
  }
  for (const el of document.querySelectorAll("img, video, canvas, svg, [style*='background'], div, section, figure")) {
    const isPic = /^(IMG|VIDEO|CANVAS|svg)$/i.test(el.tagName) || /url\(/.test(getComputedStyle(el).backgroundImage);
    if (!isPic) continue;
    const a = area(el.getBoundingClientRect()) / (vw * vh);
    if (a < 0.04 || visible(el) < 0.6) continue;
    pic = Math.max(pic, Math.min(1, a));
  }
  return { text: Math.round(text), pic: Math.round(pic * 100) / 100, overlaps: overlaps.slice(0, 4), clipped: clipped.slice(0, 4) };
}

/** Pure: "empty beats" from dense content samples [{t, text, pic}]: stretches of at least `minSec` (not in the first
 * 0.3 s) where no readable text (>= `minText` px) and no picture covering >= `minPic` of the frame is on screen
 * (a transition that clears the stage before the next beat arrives, or a half-built scene). */
export function emptyBeats(samples, { minText = 42, minPic = 0.12, minSec = 0.5, step = 0.25 } = {}) {
  const out = [];
  let start = null, last = null;
  const flush = () => { if (start !== null && last - start + step >= minSec) out.push({ start: r1(start), end: r1(last + step) }); start = null; };
  for (const s of samples || []) {
    const empty = s.t >= 0.3 && s.text < minText && s.pic < minPic;
    if (empty) { if (start === null) start = s.t; last = s.t; } else flush();
  }
  flush();
  return out;
}

/** Pure: collisions and edge-clipped pictures from dense samples. A text collision counts when it shows at 1+ samples
 * and lasts 2+ samples (a slam passing over its neighbour is fine); a clipped picture when it stays clipped at 3+ samples. */
export function collisions(samples) {
  const hit = new Map(), clip = new Map();
  for (const s of samples || []) {
    for (const o of s.overlaps || []) { const c = hit.get(o) ?? []; c.push(s.t); hit.set(o, c); }
    for (const c of s.clipped || []) { const v = clip.get(c) ?? []; v.push(s.t); clip.set(c, v); }
  }
  const span = (ts) => `${ts[0]}s${ts.length > 1 ? `-${ts[ts.length - 1]}s` : ""}`;
  return {
    overlaps: [...hit].filter(([, ts]) => ts.length >= 2).slice(0, 6).map(([k, ts]) => `${k} at ${span(ts)}`),
    clipped: [...clip].filter(([, ts]) => ts.length >= 3).slice(0, 4).map(([k, ts]) => `${k} at ${span(ts)}`),
  };
}

/** Visible text sizes at `samples` evenly spaced times, read from the live DOM (HyperFrames runtime seeks the timeline). */
export async function compositionText(compDir, { projectDir = compDir, samples = 12, timeoutMs = 45_000 } = {}) {
  const hf = hyperframesPkg();
  if (!hf) return null;
  const html = await readFile(join(compDir, "index.html"), "utf8").catch(() => null);
  if (html === null) return null;
  const size = compositionSize(html);
  if (!(size.duration > 0)) return null;
  const runtime = await readFile(join(hf.dir, "dist", "hyperframe.runtime.iife.js"), "utf8").catch(() => null);
  if (!runtime) return null;
  let chromium;
  try { ({ chromium } = await import("playwright")); } catch { return null; }
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-dev-shm-usage"] }).catch(() => null);
  if (!browser) return null;
  const timer = setTimeout(() => void browser.close().catch(() => undefined), timeoutMs);
  try {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    const roots = [resolve(compDir), resolve(projectDir)];
    await page.route("http://ozzy-qa.local/**", async (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      if (p === "/") return route.fulfill({ body: html.replace(/<\/body>/i, () => `<script>${runtime}</script></body>`), contentType: "text/html" });
      for (const root of roots) {
        const f = normalize(join(root, p));
        if (!f.startsWith(root)) continue;
        const body = await readFile(f).catch(() => null);
        if (body) return route.fulfill({ body, contentType: TYPES[extname(f).toLowerCase()] ?? "application/octet-stream" });
      }
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto("http://ozzy-qa.local/", { waitUntil: "load", timeout: timeoutMs });
    await page.waitForFunction(() => window.__playerReady === true && typeof window.__player?.renderSeek === "function", null, { timeout: 10_000 });
    await page.evaluate(() => document.fonts?.ready);
    const out = [];
    for (let i = 0; i < samples; i++) {
      const t = Math.round(((i + 0.5) / samples) * size.duration * 10) / 10;
      await page.evaluate((s) => window.__player.renderSeek(s), t);
      out.push({ t, items: await page.evaluate(collectText) });
    }
    // Dense pass (every 0.25 s): is anything carrying the frame? Catches stages cleared between beats.
    const dense = [];
    for (let t = 0; t < size.duration - 0.05; t += 0.25) {
      const tt = Math.round(t * 100) / 100;
      await page.evaluate((s) => window.__player.renderSeek(s), tt);
      dense.push({ t: tt, ...(await page.evaluate(collectContent)) });
    }
    return { ...size, samples: out, dense };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => undefined);
  }
}

/** Flash safety for a finished video: check; on fail soften the failing windows with ffmpeg and check again.
 * Returns { ok, file, windows, softened, ms } (file = the video to deliver when ok), or null when unverifiable. */
export async function flashSafe(video, { ffmpeg = process.env.HYPERFRAMES_FFMPEG_PATH || "ffmpeg", signal } = {}) {
  const t0 = Date.now();
  let analyze;
  try { ({ analyzeFlashes: analyze } = await import(new URL("../vendor/bin/flash-check.mjs", import.meta.url).href)); } catch { return null; }
  const first = await analyze(video, signal).catch(() => null);
  if (!first) return null;
  if (first.ok) return { ok: true, file: video, windows: [], softened: false, ms: Date.now() - t0 };
  const windows = flashWindows(first);
  const soft = video.replace(/(\.[^./]+)?$/, "-soft.mp4");
  const r = await run(ffmpeg, ["-y", "-v", "error", "-i", video, "-vf", softenFilter(windows), "-c:a", "copy", "-pix_fmt", "yuv420p", soft], { timeoutMs: 300_000 });
  const again = r.code === 0 ? await analyze(soft, signal).catch(() => null) : null;
  return { ok: Boolean(again?.ok), file: again?.ok ? soft : null, windows, softened: r.code === 0, ms: Date.now() - t0 };
}

/** Pixel QA for the agent's QA loop: draft motion + phone text (each optional), as fix parts and numbers. */
export async function pixelQa(compDir, { motion = true, text = true, projectDir = compDir } = {}) {
  const t0 = Date.now();
  const [m, t] = await Promise.all([
    motion ? compositionMotion(compDir).catch(() => null) : null,
    text ? compositionReadability(compDir, { projectDir }).catch(() => null) : null,
  ]);
  const { defects, advice } = pixelFixParts({ motion: m, text: t });
  return {
    defects, advice, ms: Date.now() - t0,
    numbers: { broken: m?.failed ? true : null, activity: m && !m.failed ? m.activity ?? null : null, still: m && !m.failed ? m.still.map((x) => x.seconds) : null, held: m?.held ? m.held.stretches.map((x) => x.seconds) : null, heldShare: m?.held ? m.held.share : null, deadHook: m?.hook ? m.hook.dead : null, metronomic: m?.pacing ? m.pacing.metronomic : null, smallText: t ? t.small.filter((x) => x.severe).length : null, empty: t?.empty ? t.empty.length : null, overlaps: t?.overlaps ? t.overlaps.length : null, clipped: t?.clipped ? t.clipped.length : null, weakHeadlines: t ? t.smallHeadline.length : null },
  };
}

/** Phone readability for a composition, or null when it can't be measured. */
export async function compositionReadability(compDir, opts = {}) {
  const t = await compositionText(compDir, opts);
  return t ? { ...readability(t.samples, { width: t.width, height: t.height }), empty: emptyBeats(t.dense, { minText: textThresholds(t.width, t.height).body }), ...collisions(t.dense), width: t.width, height: t.height } : null;
}

// CLI for offline checks: node pixel-qa.mjs motion <video.mp4> | draft <compDir> | text <compDir>
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [cmd, target] = process.argv.slice(2);
  const t0 = Date.now();
  const res = cmd === "motion" ? await videoMotion(target) : cmd === "draft" ? await compositionMotion(target) : cmd === "text" ? await compositionReadability(target) : null;
  process.stdout.write(`${JSON.stringify({ cmd, target, ms: Date.now() - t0, res })}\n`);
}

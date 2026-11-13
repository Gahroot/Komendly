// Ozzy Studio quality gate: catch blank / near-empty frames in a finished composition before delivery.
// Cheap models sometimes say "I checked the stills" while scenes stay invisible. This takes evenly spaced stills
// with `hyperframes snapshot`, measures each one with ffmpeg (luma spread on a tiny greyscale copy) and returns
// the times that are basically one flat colour, so the agent gets one fix round. Pure helpers are unit-tested.
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Spread (standard deviation) of 8-bit grey samples. */
export function lumaSpread(bytes) {
  if (!bytes.length) return 0;
  let sum = 0;
  for (const b of bytes) sum += b;
  const mean = sum / bytes.length;
  let v = 0;
  for (const b of bytes) v += (b - mean) * (b - mean);
  return Math.sqrt(v / bytes.length);
}

/** A frame is blank when its grey spread is tiny (one flat colour, maybe a faint gradient). */
export const BLANK_SPREAD = 4;
export const isBlankSpread = (spread) => spread < BLANK_SPREAD;

/** Evenly spaced check times inside the video, away from the very start/end and from scene wipes. */
export function checkTimes(duration, n = 10) {
  if (!(duration > 0)) return [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round(((i + 0.5) / n) * duration * 100) / 100);
  return out;
}

/** The fix prompt for the agent (plain, specific, no user-facing wording). */
export function blankFixPrompt(times) {
  return `[Studio QA, automatic] The stills at ${times.map((t) => `${t}s`).join(", ")} are blank (one flat colour, nothing readable). Those scenes are not visible in the video. Find why (hidden elements, a wipe or overlay left covering the frame, elements never animated in, wrong timing or visibility) and fix index.html so every scene shows its content. Then check those exact times again with \`hf snapshot --at\` and look at the images. Keep everything else the same. When it's fixed, reply to the user again in one or two plain lines about the video (don't mention this check or any fixing).`;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    const out = [];
    let err = "";
    c.stdout.on("data", (d) => out.push(d));
    c.stderr.on("data", (d) => (err = (err + d.toString()).slice(-2000)));
    const t = setTimeout(() => c.kill("SIGKILL"), opts.timeoutMs ?? 120_000);
    c.on("close", (code) => { clearTimeout(t); resolve({ code, stdout: Buffer.concat(out), stderr: err }); });
    c.on("error", () => { clearTimeout(t); resolve({ code: -1, stdout: Buffer.alloc(0), stderr: "spawn failed" }); });
  });
}

/** Newest composition folder (index.html) under the project, like the engine's changedComposition. */
async function newestComposition(dir, depth = 0) {
  let best = null;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (["node_modules", "uploads", "renders", "snapshots", "kit", ".git", "brand"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 3) {
      const b = await newestComposition(p, depth + 1);
      if (b && (!best || b.m > best.m)) best = b;
    } else if (e.name === "index.html") {
      const m = (await stat(p)).mtimeMs;
      if (!best || m > best.m) best = { d: dir, m };
    }
  }
  return best;
}

/** The user asked for a silent video (then the music check is skipped). */
export function wantsSilence(prompt) {
  return /\b(no|without|skip|mute[ds]?|silent|zero)\s+(background\s+)?(music|sound|audio)\b|\bsilent( video| ad)?\b|\bno soundtrack\b/i.test(prompt);
}

/** Does this composition play any audio (an <audio> element or a <video> that isn't muted)? */
export function hasAudio(html) {
  return /<audio\b[^>]*\bsrc=/i.test(html) || /<video\b(?![^>]*\bmuted\b)[^>]*\bsrc=/i.test(html);
}

export const MUSIC_FIX_PROMPT = "[Studio QA, automatic] The video has no music or sound. Follow the Sound rule in ./studio.md: write ./audio/score.json for THIS business and mood (pick style, bpm, key and hits yourself), run `node kit/bin/score-synth.mjs audio/score.json audio/`, and add audio/music.wav and audio/sfx.wav to index.html as <audio> elements spanning the whole video. Keep the visuals exactly as they are. Then reply to the user again in one or two plain lines about the video (don't mention this check).";

/** Pure: real layout problems from `hyperframes inspect --json` issues (overlapping/stacked text, covered text). */
export function layoutProblems(issues) {
  // Decorative glyphs (quote marks, bullets) don't count; a fix round needs 3+ distinct real problems.
  const bad = (issues || []).filter((i) => ((i.code === "text_occluded" && i.severity === "error") || (i.code === "content_overlap" && i.severity === "warning")) && String(i.text ?? "").replace(/[^\p{L}\p{N}]/gu, "").length >= 3);
  const seen = new Set();
  const out = [];
  for (const i of bad) {
    const key = `${i.code}:${(i.text || "").slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${Number(i.time ?? 0).toFixed(1)}s ${i.code === "text_occluded" ? "text covered by another element" : "elements overlapping"}${i.text ? `: "${String(i.text).slice(0, 40)}"` : ""}`);
    if (out.length >= 8) break;
  }
  return out.length >= 3 ? out : [];
}

/** Overlap/covered-text problems in the newest composition ([] on any tooling problem: never block). */
export async function findLayoutProblems(projectDir, { sinceMs = 0 } = {}) {
  const comp = await newestComposition(projectDir);
  if (!comp || comp.m < sinceMs) return [];
  const entry = hyperframesEntry();
  if (!entry) return [];
  const r = await run(process.execPath, [entry, "inspect", comp.d, "--json", "--samples", "10"], { timeoutMs: 90_000, env: process.env });
  const text = r.stdout.toString();
  try {
    return layoutProblems(JSON.parse(text.slice(text.indexOf("{"))).issues);
  } catch {
    return [];
  }
}

/** One combined fix prompt for everything the QA found (one extra agent round at most). */
export function qaFixPrompt({ blank = [], sparse = [], layout = [], music = false, missing = [] }) {
  const parts = [];
  if (missing.length) parts.push(`- These files are used in index.html but don't exist, so they show as empty spaces: ${missing.join(", ")}. Point each one at a file that exists (check with ls: kit/illustrations, kit/icons, brand/photos, brand/site, uploads) or remove it and fill the space.`);
  if (sparse.length) parts.push(`- Large empty areas: at ${sparse.map((t) => `${t}s`).join(", ")} half the frame or more is one flat colour with nothing in it. Fill the frame: make the hero image, footage or website piece much bigger (or full-bleed with a scrim), scale the type up, or centre the content block vertically. Nothing should sit in one half with the other half empty.`);
  if (blank.length) parts.push(`- Blank frames (one flat colour, nothing readable) at ${blank.map((t) => `${t}s`).join(", ")}: those scenes don't show. Find why (hidden elements, a wipe/overlay left covering the frame, elements never animated in, wrong timing) and fix it.`);
  if (layout.length) parts.push(`- Layout problems (text from different scenes stacked on top of each other, or text covered by other elements):\n${layout.map((l) => `  - ${l}`).join("\n")}\n  Make sure each scene's text is fully hidden before the next scene's text appears (animate it out or set autoAlpha 0 at the cut), and nothing covers text that should be read.`);
  if (music) parts.push("- No music or sound: follow the Sound rule in ./studio.md (write ./audio/score.json for THIS business and mood, run `node kit/bin/score-synth.mjs audio/score.json audio/`, add audio/music.wav and audio/sfx.wav as <audio> elements spanning the whole video).");
  return `[Studio QA, automatic] The finished video has these problems:\n${parts.join("\n")}\nFix them in index.html, keep everything else the same, check the fixed times with \`hf snapshot --at\` and look at the images. Then reply to the user again in one or two plain lines about the video (don't mention this check).`;
}

function hyperframesEntry() {
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve("hyperframes/package.json");
    const pkg = req(pkgPath);
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.hyperframes;
    return join(dirname(pkgPath), bin);
  } catch {
    return null;
  }
}

/** Pure: relative file references (src=, href= on link, url() in CSS) in a composition. */
export function referencedFiles(raw) {
  // Comments hold examples ("brand/photos/x.jpg"), not real references.
  const html = String(raw).replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
  const out = new Set();
  const add = (u) => {
    const v = String(u).trim().replace(/^['"]|['"]$/g, "");
    if (!v || /^(https?:|data:|blob:|#|\/\/|about:|javascript:)/i.test(v) || v.includes("${")) return;
    out.add(decodeURI(v.split(/[?#]/)[0].replace(/^\.\//, "")));
  };
  for (const m of html.matchAll(/\s(?:src|poster)\s*=\s*("[^"]*"|'[^']*')/gi)) add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*("[^"]*"|'[^']*')/gi)) add(m[1]);
  for (const m of html.matchAll(/url\(\s*("[^"]*"|'[^']*'|[^)'"]+)\s*\)/gi)) add(m[1]);
  return [...out];
}

/** Files the newest composition points at that don't exist (images that will render as empty boxes). */
export async function findMissingAssets(projectDir, { sinceMs = 0 } = {}) {
  const comp = await newestComposition(projectDir);
  if (!comp || comp.m < sinceMs) return [];
  const { readFile, access } = await import("node:fs/promises");
  const html = await readFile(join(comp.d, "index.html"), "utf8").catch(() => "");
  const missing = [];
  for (const f of referencedFiles(html)) {
    const p = f.startsWith("/") ? join(projectDir, f) : join(comp.d, f);
    if (await access(p).then(() => false, () => true)) missing.push(f);
  }
  return missing.slice(0, 12);
}

/** Newest composition html, or null. */
export async function newestCompositionHtml(projectDir, sinceMs = 0) {
  const comp = await newestComposition(projectDir);
  if (!comp || comp.m < sinceMs) return null;
  const { readFile } = await import("node:fs/promises");
  return readFile(join(comp.d, "index.html"), "utf8").catch(() => null);
}

function compositionDuration(html) {
  const m = /data-duration="([\d.]+)"/.exec(html);
  return m ? Number(m[1]) : 0;
}

/** Times (seconds) of blank frames in the newest composition, or [] (also on any tooling problem: never block). */
/** Pure: share of horizontal bands (of `bands`) that are flat, from 8-bit grey pixels `w` wide. */
export function flatBandShare(bytes, w, bands = 4) {
  const h = Math.floor(bytes.length / w);
  if (!w || h < bands) return 0;
  let flat = 0;
  for (let b = 0; b < bands; b++) {
    const from = Math.floor((b * h) / bands) * w, to = Math.floor(((b + 1) * h) / bands) * w;
    if (isBlankSpread(lumaSpread(bytes.subarray(from, to)))) flat++;
  }
  return flat / bands;
}

/** Blank frames AND mostly-empty frames (half or more of the frame is one flat colour), from the same stills. */
export async function findFrameIssues(projectDir, opts = {}) {
  const r = await frameStats(projectDir, opts);
  return r;
}

export async function findBlankFrames(projectDir, opts = {}) {
  return (await frameStats(projectDir, opts)).blank;
}

async function frameStats(projectDir, { sinceMs = 0, ffmpeg = "ffmpeg" } = {}) {
  const none = { blank: [], sparse: [] };
  const comp = await newestComposition(projectDir);
  if (!comp || comp.m < sinceMs) return none;
  const { readFile } = await import("node:fs/promises");
  const duration = compositionDuration(await readFile(join(comp.d, "index.html"), "utf8").catch(() => ""));
  const times = checkTimes(duration);
  if (!times.length) return none;
  // Each time is checked twice, 0.6 s apart: a wipe or fade passing over the frame is fine, a frame that stays flat isn't.
  const shots = times.flatMap((t) => [t, Math.min(Math.round((t + 0.6) * 100) / 100, Math.max(duration - 0.05, 0))]);
  let entry;
  try {
    const req = createRequire(import.meta.url);
    const pkgPath = req.resolve("hyperframes/package.json");
    const pkg = req(pkgPath);
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.hyperframes;
    entry = join(dirname(pkgPath), bin);
  } catch {
    return none;
  }
  const outDir = await mkdtemp(join(tmpdir(), "ozzy-qa-"));
  try {
    const snap = await run(process.execPath, [entry, "snapshot", comp.d, "-o", outDir, "--at", shots.join(","), "--no-end", "--describe", "false"], { timeoutMs: 120_000, env: process.env });
    if (snap.code !== 0) return none;
    const files = (await readdir(outDir)).filter((f) => f.endsWith(".png")).sort();
    if (files.length < shots.length) return none;
    const flat = [], half = [];
    for (const f of files.slice(0, shots.length)) {
      const g = await run(ffmpeg, ["-v", "error", "-i", join(outDir, f), "-vf", "scale=64:-1,format=gray", "-f", "rawvideo", "-"], { timeoutMs: 20_000 });
      const ok = g.code === 0 && g.stdout.length > 0;
      flat.push(ok && isBlankSpread(lumaSpread(g.stdout)));
      half.push(ok && flatBandShare(g.stdout, 64, 4) >= 0.5);
    }
    const blank = times.filter((_, i) => flat[2 * i] && flat[2 * i + 1]);
    // Mostly empty: half the frame flat in both stills, and that's true for 3+ of the 10 check times.
    const sparseTimes = times.filter((t, i) => !blank.includes(t) && half[2 * i] && half[2 * i + 1]);
    return { blank, sparse: sparseTimes.length >= 3 ? sparseTimes : [] };
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

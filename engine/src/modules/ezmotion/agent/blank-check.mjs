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

function compositionDuration(html) {
  const m = /data-duration="([\d.]+)"/.exec(html);
  return m ? Number(m[1]) : 0;
}

/** Times (seconds) of blank frames in the newest composition, or [] (also on any tooling problem: never block). */
export async function findBlankFrames(projectDir, { sinceMs = 0, ffmpeg = "ffmpeg" } = {}) {
  const comp = await newestComposition(projectDir);
  if (!comp || comp.m < sinceMs) return [];
  const { readFile } = await import("node:fs/promises");
  const duration = compositionDuration(await readFile(join(comp.d, "index.html"), "utf8").catch(() => ""));
  const times = checkTimes(duration);
  if (!times.length) return [];
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
    return [];
  }
  const outDir = await mkdtemp(join(tmpdir(), "ozzy-qa-"));
  try {
    const snap = await run(process.execPath, [entry, "snapshot", comp.d, "-o", outDir, "--at", shots.join(","), "--no-end", "--describe", "false"], { timeoutMs: 120_000, env: process.env });
    if (snap.code !== 0) return [];
    const files = (await readdir(outDir)).filter((f) => f.endsWith(".png")).sort();
    if (!files.length) return [];
    if (files.length < shots.length) return [];
    const flat = [];
    for (const f of files.slice(0, shots.length)) {
      const g = await run(ffmpeg, ["-v", "error", "-i", join(outDir, f), "-vf", "scale=64:-1,format=gray", "-f", "rawvideo", "-"], { timeoutMs: 20_000 });
      flat.push(g.code === 0 && g.stdout.length > 0 && isBlankSpread(lumaSpread(g.stdout)));
    }
    return times.filter((_, i) => flat[2 * i] && flat[2 * i + 1]);
  } finally {
    await rm(outDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

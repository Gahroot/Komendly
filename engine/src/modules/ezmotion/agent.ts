import sharp from "sharp";
// Agent style: the real EZ Motion agent (EZ Coder's Motion mode, @prestyj/cli) makes the video from
// the website and a 3-4 sentence brief, the way a person would prompt it. It runs headless in a
// child process with its own HOME, using the engine's ChatGPT login (leased; refreshed pairs adopted
// back). Any failure falls back to the deterministic hype edit.
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RATIO_PIXELS, type Ratio } from "../../../../src/lib/ads/contracts";
import { loadPrices, textCostMicros } from "../../providers/cost";
import { ffmpegPath, run } from "./runtime";
import { bundleMusic, renderQuality } from "./quality-render";
import { analyzeMotion, freezeReview, type MotionReport } from "./motion-checks";
import { checkSafeZones, motionRules, type SafeZoneReport, safeZoneReview } from "./safezone";
import type { MotionRenderInput } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
export const AGENT_TIMEOUT_MS = Number(process.env.EZMOTION_AGENT_TIMEOUT_MS ?? 20 * 60_000);
const RATIO_WORDS: Record<Ratio, string> = { "9:16": "Vertical 9:16 for Reels and TikTok", "4:5": "4:5 for the Instagram and Facebook feed", "1:1": "Square 1:1" };
export const ratioFile = (r: Ratio) => `final-${r.replace(":", "x")}.mp4`;
/** Folder the agent builds each ratio's composition in (the engine renders it). */
export const ratioDir = (r: Ratio) => `video-${r.replace(":", "x")}`;

/**
 * The brief: what a person types into Motion. The reference set came from "make hype video ads that are super
 * fast cuts and energetic" + the URL, so the brief leads with exactly that; only the rules that matter follow.
 */
export function agentBrief(o: { url: string; brandName: string; audience?: string; ratios: Ratio[]; seconds: number; facts?: boolean; review?: boolean; music?: boolean }): string {
  const [first, ...rest] = o.ratios.length ? o.ratios : (["9:16"] as Ratio[]);
  const who = o.audience?.trim() ? ` Their audience: ${o.audience.trim().replace(/\s+/g, " ").slice(0, 160).replace(/\.?$/, ".")}` : "";
  const extra = rest.length ? `, plus ${rest.map((r) => `a ${r} version in ./${ratioDir(r)}`).join(" and ")}` : "";
  return [
    `Make a hype video ad that is super fast cuts and energetic for ${o.url} (${o.brandName}).${who}`,
    `Open on the buyer's frustration in their words, not a slogan; brand name once; only offers the site states.`,
    `${RATIO_WORDS[first as Ratio]}, about ${o.seconds} seconds; the site's own images and logo are in ./brand${o.music ? ", with a licensed music track ./brand/music.mp3 and its beat list ./brand/beats.json to cut every scene on" : ""}${o.facts ? "; claims and numbers come from the site or ./brand/facts.txt" : ""}.`,
    `Use the visuals in ./brand plus your own designed illustration, and follow ./brand/rules.txt (Meta placement: words in the safe band, plain-text CTA).`,
    ...(o.review ? ["A reviewer rejected the last version: fix what ./brand/review.txt says."] : []),
    `Don't ask me anything and skip the final render (I render it with motion blur myself): just build the finished video in ./${ratioDir(first as Ratio)}/index.html${extra}.`,
  ].join(" ");
}

export function cliAvailable(): boolean {
  if (process.env.EZMOTION_CLI_DIST) return true;
  try {
    import.meta.resolve("@prestyj/cli");
    return true;
  } catch {
    return false;
  }
}

/** Visible words of the rendered composition(s) only (never the agent's saved copies of the site), for grounding QC. */
export async function compositionText(dirs: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const dir of dirs) {
        const html = await readFile(join(dir, "index.html"), "utf8").catch(() => "");
        const text = html
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<title[\s\S]*?<\/title>/gi, " ")
          .replace(/<[^>]+>/g, "\n")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
        for (const line of text.split("\n").map((l) => l.trim().replace(/\s+/g, " ")).filter((l) => l.length > 1)) if (!out.includes(line)) out.push(line);
  }
  return out.slice(0, 80);
}

/** Token totals from the agent's session log -> list-price cost (cached input billed at 10%). */
export async function agentUsage(home: string, model: string): Promise<{ costMicros: number; inputTokens: number; outputTokens: number }> {
  let input = 0, output = 0, cached = 0;
  const walk = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".jsonl")) {
        const raw = await readFile(p, "utf8");
        for (const m of raw.matchAll(/"usage":\{([^}]*)\}/g)) {
          const u = m[1] ?? "";
          input += Number(/"inputTokens":(\d+)/.exec(u)?.[1] ?? 0);
          output += Number(/"outputTokens":(\d+)/.exec(u)?.[1] ?? 0);
          cached += Number(/"cacheRead":(\d+)/.exec(u)?.[1] ?? 0);
        }
      }
    }
  };
  await walk(join(home, ".ezcoder"));
  return { costMicros: textCostMicros(loadPrices(process.env), model, input + Math.round(cached * 0.1), output), inputTokens: input + cached, outputTokens: output };
}

/** The agent's composition for a ratio: ./video-<r>/index.html, else any index.html whose root has that frame size. */
export async function compositionDirFor(project: string, r: Ratio): Promise<string | null> {
  const want = join(project, ratioDir(r));
  if ((await stat(join(want, "index.html")).catch(() => null))?.isFile()) return want;
  const { width, height } = RATIO_PIXELS[r];
  const found: Array<{ dir: string; mtime: number }> = [];
  const walk = async (d: string, depth: number): Promise<void> => {
    if (depth > 2) return;
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (!e.isDirectory() || ["brand", "node_modules", "renders", "snapshots", "assets", "sources"].includes(e.name)) continue;
      const dir = join(d, e.name);
      const html = await readFile(join(dir, "index.html"), "utf8").catch(() => "");
      if (html && new RegExp(`data-width="${width}"`).test(html) && new RegExp(`data-height="${height}"`).test(html)) {
        found.push({ dir, mtime: (await stat(join(dir, "index.html"))).mtimeMs });
      }
      await walk(dir, depth + 1);
    }
  };
  await walk(project, 0);
  return found.sort((a, b) => b.mtime - a.mtime)[0]?.dir ?? null;
}

/** Feed loudness (-14 LUFS, limited), video copied. False when there is no audio or ffmpeg fails. */
async function loudness(input: string, output: string, signal?: AbortSignal): Promise<boolean> {
  const ff = await ffmpegPath();
  if (!ff) return false;
  const r = await run(ff, ["-y", "-v", "error", "-i", input, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.8:level=false", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", output], { signal });
  return r.code === 0;
}

export interface AgentRun {
  ok: boolean;
  files: Partial<Record<Ratio, string>>;
  error?: string;
  log: string;
  ms: number;
  text: string[];
  usage: { costMicros: number; inputTokens: number; outputTokens: number };
  safeZone?: SafeZoneReport & { passes: number };
  renders?: Partial<Record<Ratio, { mode: "blur" | "plain"; ms: number; samples?: number }>>;
  music?: string;
  /** Post-render freeze + beat check of the lead ratio (after at most one freeze fix turn). */
  motion?: MotionReport & { fixTurns: number };
}

/** Runs the Motion agent; returns the produced files (missing ratios simply absent). */
export async function runMotionAgent(input: MotionRenderInput, ratios: Ratio[], seconds: number): Promise<AgentRun> {
  const started = Date.now();
  const creds = input.provider.agentCredentials;
  const root = join(input.workDir, "agent");
  const home = join(root, "home");
  const project = join(root, "project");
  await mkdir(join(home, ".ezcoder"), { recursive: true });
  await mkdir(join(project, "brand"), { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, EZCODER_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_TELEMETRY: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1" };
  let leased: Awaited<ReturnType<NonNullable<typeof creds>["lease"]>> | null = null;
  if (creds) {
    leased = await creds.lease();
    await writeFile(join(home, ".ezcoder", "auth.json"), JSON.stringify({ openai: leased }), { mode: 0o600 });
  } else if (!process.env.OPENAI_API_KEY) {
    return { ok: false, files: {}, error: "no Codex login or OPENAI_API_KEY for the motion agent", log: "", ms: 0, text: [], usage: { costMicros: 0, inputTokens: 0, outputTokens: 0 } };
  }
  // The site's own images (no faces: never altered) and the logo.
  const brand = input.brand;
  if (brand.logoPath) await copyFile(brand.logoPath, join(project, "brand", `logo${extname(brand.logoPath) || ".png"}`)).catch(() => undefined);
  for (const [i, a] of (await sharpAssets(brand.assets.filter((x) => !x.hasFace && x.kind !== "icon"))).slice(0, 10).entries()) {
    await copyFile(a.path, join(project, "brand", `${a.kind}-${i + 1}${extname(a.path) || ".png"}`)).catch(() => undefined);
  }
  const facts = input.brief?.facts ?? [];
  if (facts.length) await writeFile(join(project, "brand", "facts.txt"), facts.map((f) => `- ${f}`).join("\n") + "\n");
  if (input.qcFeedback) await writeFile(join(project, "brand", "review.txt"), input.qcFeedback.slice(0, 2000) + "\n");
  await writeFile(join(project, "brand", "rules.txt"), motionRules(ratios[0] ?? "9:16") + "\n");
  const music = process.env.EZMOTION_MUSIC === "0" ? null : await bundleMusic(join(project, "brand"), input.siteUrl).catch(() => null);
  const briefOf = (review: boolean) => agentBrief({ url: input.siteUrl, brandName: brand.brandName, audience: input.brief?.audience, ratios, seconds, facts: facts.length > 0, review, music: !!music });
  await writeFile(join(root, "brief.txt"), briefOf(!!input.qcFeedback));
  const runner = join(HERE, "agent", "run-motion-agent.mjs");
  // User's choice: GPT-6.1 Sol on high thinking.
  const model = process.env.EZMOTION_AGENT_MODEL ?? "gpt-6.1-sol";
  const thinking = process.env.EZMOTION_AGENT_THINKING ?? "high";
  const spawnAgent = (briefFile: string) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [runner, project, briefFile, "--model", model, "--thinking", thinking], { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-20_000)));
    const kill = () => child.kill("SIGTERM");
    const timer = setTimeout(kill, AGENT_TIMEOUT_MS);
    input.signal?.addEventListener("abort", kill, { once: true });
    child.on("close", (code) => {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", kill);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
  let res = await spawnAgent(join(root, "brief.txt"));
  let log = res.stderr;
  // Deterministic gate: step the composition in Chrome; text in the Reels UI bands or button-shaped
  // CTAs go back to the agent as a review (EZMOTION_SAFEZONE_RETRIES, default 1).
  const lead = ratios[0] ?? "9:16";
  let safeZone: AgentRun["safeZone"];
  const retries = Number(process.env.EZMOTION_SAFEZONE_RETRIES ?? 1);
  for (let pass = 0; ; pass++) {
    const dir = await compositionDirFor(project, lead);
    if (!dir || input.signal?.aborted) break;
    const rep = await checkSafeZones(dir, lead, { signal: input.signal });
    safeZone = { ...rep, passes: pass + 1 };
    if (rep.ok || pass >= retries || Date.now() - started > AGENT_TIMEOUT_MS * 0.75) break;
    const prior = input.qcFeedback ? `${input.qcFeedback.slice(0, 1200)}\n\n` : "";
    await writeFile(join(project, "brand", "review.txt"), `${prior}${safeZoneReview(rep.issues)}\n`);
    await writeFile(join(root, `brief-fix${pass + 1}.txt`), `${briefOf(true)} Edit the existing ./${ratioDir(lead)}/index.html in place; keep what works.`);
    res = await spawnAgent(join(root, `brief-fix${pass + 1}.txt`));
    log += res.stderr;
  }
  await writeFile(join(root, "agent.log"), log).catch(() => undefined);
  // Refresh tokens rotate: if the child refreshed, keep its pair.
  if (creds && leased) {
    try {
      const after = (JSON.parse(await readFile(join(home, ".ezcoder", "auth.json"), "utf8")) as { openai?: typeof leased }).openai;
      if (after?.refreshToken && after.refreshToken !== leased.refreshToken) await creds.adopt(after);
    } catch { /* unchanged */ }
  }
  const files: Partial<Record<Ratio, string>> = {};
  const renderErrors: string[] = [];
  const usedDirs: string[] = [];
  const renders: NonNullable<AgentRun["renders"]> = {};
  let renderN = 0;
  const renderRatio = async (r: Ratio, dir: string): Promise<void> => {
    // QUALITY render: EZ Motion's motion-blur step (plain render fallback inside).
    const tag = `${r.replace(":", "x")}${renderN++ ? `-${renderN}` : ""}`;
    const rr = await renderQuality(dir, join(root, `render-${tag}.mp4`), { signal: input.signal });
    renders[r] = { mode: rr.mode, ms: (renders[r]?.ms ?? 0) + rr.ms, ...(rr.samples ? { samples: rr.samples } : {}) };
    if (rr.ok) {
      const loud = join(root, `loud-${tag}.mp4`);
      files[r] = rr.loudnessDone ? rr.output : (await loudness(rr.output, loud, input.signal)) ? loud : rr.output;
    } else renderErrors.push(`${r}: ${rr.error ?? "render failed"}`);
  };
  for (const r of ratios) {
    const done = join(project, ratioFile(r));
    if ((await stat(done).catch(() => null))?.size) {
      files[r] = done;
      const d = await compositionDirFor(project, r);
      if (d) usedDirs.push(d);
      continue;
    }
    const dir = await compositionDirFor(project, r);
    if (!dir) continue;
    usedDirs.push(dir);
    await renderRatio(r, dir);
  }
  // Freeze check on the lead render: frozen stretches (outside the end card) go back to the agent once.
  let motion: AgentRun["motion"];
  const leadFile = files[lead];
  if (leadFile && !input.signal?.aborted && process.env.EZMOTION_MOTION_CHECK !== "0") {
    const beats = music?.beats ?? [];
    let rep = await analyzeMotion(leadFile, beats, { signal: input.signal });
    let fixTurns = 0;
    const dir = await compositionDirFor(project, lead);
    if (rep.checked && rep.freezes.length && dir && Date.now() - started < AGENT_TIMEOUT_MS * 1.25 && Number(process.env.EZMOTION_FREEZE_RETRIES ?? 1) > 0) {
      fixTurns = 1;
      await writeFile(join(project, "brand", "review.txt"), `${freezeReview(rep.freezes)}\n`);
      await writeFile(join(root, "brief-freeze.txt"), `${briefOf(true)} Edit the existing ./${ratioDir(lead)}/index.html in place; keep what works.`);
      res = await spawnAgent(join(root, "brief-freeze.txt"));
      log += res.stderr;
      await writeFile(join(root, "agent.log"), log).catch(() => undefined);
      const before = files[lead];
      await renderRatio(lead, dir);
      if (files[lead] && files[lead] !== before) rep = await analyzeMotion(files[lead] as string, beats, { signal: input.signal });
      else if (before) files[lead] = before;
    }
    motion = { ...rep, fixTurns };
  }
  const last = res.stdout.trim().split("\n").pop() ?? "";
  let error: string | undefined;
  try {
    const j = JSON.parse(last) as { ok?: boolean; error?: string };
    if (!j.ok) error = j.error ?? "agent failed";
  } catch {
    error = `agent exited ${res.code}: ${res.stderr.slice(-300)}`;
  }
  if (!Object.keys(files).length) error = [error, `no video for ${ratios[0] ?? "9:16"}`, ...renderErrors].filter(Boolean).join("; ");
  return { ok: !!files[ratios[0] ?? "9:16"], files, error, log: basename(root), ms: Date.now() - started, text: await compositionText(usedDirs), usage: await agentUsage(home, model), safeZone, renders, ...(motion ? { motion } : {}), ...(music ? { music: music.track } : {}) };
}

/** Minimum short side (px) for a photo to look sharp full-bleed in a 1080-wide video frame. */
export const MIN_VIDEO_SHORT_SIDE = 720;

/**
 * Sharpest site images first; soft/low-res ones (short side < MIN_VIDEO_SHORT_SIDE) are dropped when at least
 * three sharp ones remain (judges flagged blurry upscaled photos as the top video flaw).
 */
export async function sharpAssets<T extends { path: string }>(assets: T[]): Promise<T[]> {
  const sized = await Promise.all(assets.map(async (a) => {
    const m = await sharp(a.path).metadata().catch(() => null);
    return { a, short: Math.min(m?.width ?? 0, m?.height ?? 0), area: (m?.width ?? 0) * (m?.height ?? 0) };
  }));
  const sorted = sized.sort((x, y) => y.area - x.area);
  const sharpOnes = sorted.filter((x) => x.short >= MIN_VIDEO_SHORT_SIDE);
  return (sharpOnes.length >= 3 ? sharpOnes : sorted).map((x) => x.a);
}

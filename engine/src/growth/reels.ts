// Growth system `reels` (flag sys_reels, default OFF): Ozzy's daily vertical short video. Each cycle (default 6h) keeps a small
// backlog of rendered, reviewed reels: next hook (70% winners / 30% new, src/lib/growth/reels-learning) -> script
// (hook / retain / reward, soft CTA every 10th) -> checks + AI review gate -> sharp SVG frames + ffmpeg (captions burned in,
// silent audio track, 1080x1920, 15-30s) -> S3 `reels/<id>/silent.mp4` + `script.txt` -> AdsEvent `reel_ready` + `social_queue` rows for the
// platforms without an API we can use. Kly publishes to Facebook/Instagram. External voice: see docs/growth-ecosystem/reels.md.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  AI_LABEL, QUEUE_PLATFORMS, REEL_EVENTS, REEL_TRADES, SITE, buildCaption, buildQueueItem, buildScript, checkReelCaption, checkScript, ctaDue, dailyCap, reelHash, reelId, withinCostCap,
  type ReelReadyProps, type ReelScript,
} from "../../../src/lib/growth/reels-core";
import { nextHook, perfsFromEvents, type ReadyLite } from "../../../src/lib/growth/reels-learning";
import { etDay } from "../../../src/lib/kly/social-core";
import { parseBeat, recordSystemRun, systemEnabled, systemHeartbeatId } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import type { AIProvider } from "../providers/types";
import type { Storage } from "../storage/s3";
import { runFfmpeg } from "../testimonial/ffmpeg";
import { gate } from "./review-gate";
import { FADE, H, W, wrap } from "./review-video";

const FONT = "DejaVu Sans, Liberation Sans, Noto Sans, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const reelKey = (id: string, file: "silent.mp4" | "voiced.mp4" | "script.txt") => `reels/${id}/${file}`;
/** Estimated spend per AI review call (micros) used for the daily cost cap: local render itself costs nothing. */
const GATE_COST_MICROS = 20_000;

export interface Art { ozzy?: string; poster?: string }

// Brand palette (DESIGN.md): night ink background, violet card, gold emphasis, white text (all >= 7:1 on the ink).
const INK = "#0c0820";
const VIOLET = "#7b3cf0";
const GOLD = "#ffcf4a";
const WHITE = "#FFFFFF";
/** Platform UI safe zone (Instagram/TikTok/Reels): nothing important above y=SAFE_TOP (~12%) or below y=SAFE_BOTTOM (~20%), nor wider than the side margins. */
export const SAFE_TOP = 240;
export const SAFE_BOTTOM = 1530;
export const SAFE_X = 110;
const FROM_LINE = "From Komendly";
const END_URL = "Free ads from your website: komendly.com";

/** Pure: one SVG frame per scene, caption burned in, AI + brand label on every frame, everything inside the safe zone. */
export function reelFrames(s: ReelScript, art: Record<string, string | undefined> = {}): Array<{ svg: string; seconds: number }> {
  const t = (x: number, y: number, str: string, size: number, weight: number, fill: string, opacity = 1) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" fill-opacity="${opacity}">${esc(str)}</text>`;
  const bgSvg = `<rect width="100%" height="100%" fill="${INK}"/><circle cx="${W}" cy="${SAFE_TOP}" r="620" fill="${VIOLET}" fill-opacity="0.22"/><circle cx="0" cy="${SAFE_BOTTOM}" r="520" fill="${VIOLET}" fill-opacity="0.14"/>`;
  return s.scenes.map((sc) => {
    const isEnd = sc.text === AI_LABEL;
    const hook = sc.kind === "hook";
    const big = hook || sc.kind === "cta";
    const poster = sc.art === "poster";
    const img = sc.art ? art[poster ? "poster" : sc.art] : undefined;
    const label = isEnd ? "" : t(W / 2, SAFE_BOTTOM - 20, `${AI_LABEL} · ${FROM_LINE}`, 34, 600, WHITE, 0.8);
    if (isEnd) {
      const ozzy = img ? `<image href="${img}" x="${W / 2 - 230}" y="${SAFE_TOP + 20}" width="460" height="460" preserveAspectRatio="xMidYMid meet"/>` : "";
      const body = ozzy + t(W / 2, 880, AI_LABEL, 76, 800, WHITE) + t(W / 2, 990, FROM_LINE, 76, 800, GOLD)
        + `<rect x="${SAFE_X}" y="1090" width="${W - 2 * SAFE_X}" height="190" rx="36" fill="${VIOLET}"/>`
        + wrap(END_URL, 24).map((l, i) => t(W / 2, 1175 + i * 62, l, 50, 700, WHITE)).join("")
        + t(W / 2, 1400, "Animated cartoon. AI-made.", 36, 500, WHITE, 0.75);
      return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bgSvg}${body}</svg>`, seconds: sc.seconds };
    }
    const size = big ? 92 : 68;
    const lines = wrap(sc.text, big ? 15 : 22);
    const lineH = size * 1.22;
    const textTop = poster ? SAFE_TOP + 90 : hook ? 930 : 800;
    const textSvg = lines.map((l, i) => t(W / 2, textTop + i * lineH, l, size, big ? 800 : 700, hook && i === 0 ? GOLD : WHITE)).join("");
    let image = "";
    if (img && poster) image = `<rect x="${W / 2 - 250}" y="900" width="500" height="${SAFE_BOTTOM - 900 - 90}" rx="28" fill="${VIOLET}"/><image href="${img}" x="${W / 2 - 240}" y="910" width="480" height="${SAFE_BOTTOM - 910 - 110}" preserveAspectRatio="xMidYMid meet"/>`;
    else if (img) image = `<image href="${img}" x="${W / 2 - 200}" y="${SAFE_TOP + (hook ? 60 : 20)}" width="${hook ? 440 : 400}" height="${hook ? 440 : 400}" preserveAspectRatio="xMidYMid meet" ${hook ? `transform="translate(-20 0)"` : ""}/>`;
    const bar = hook ? `<rect x="${W / 2 - 90}" y="${textTop - size - 70}" width="180" height="12" rx="6" fill="${GOLD}"/>` : "";
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${bgSvg}${bar}${image}${textSvg}${label}</svg>`, seconds: sc.seconds };
  });
}

/** ffmpeg args (pure): each still gets a slow zoom-in, crossfades, plus a silent AAC track (some platforms reject video without audio). */
export function reelVideoArgs(files: readonly string[], seconds: readonly number[], output: string): string[] {
  const FPS = 30;
  const inputs = files.flatMap((f) => ["-i", f]);
  const parts = files.map((_f, i) => {
    const frames = Math.ceil((seconds[i] ?? 3) * FPS);
    return `[${i}:v]scale=${W * 2}:${H * 2},zoompan=z='min(1+0.0004*on,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1[v${i}]`;
  });
  let last = "v0";
  let offset = 0;
  for (let i = 1; i < files.length; i++) {
    offset += (seconds[i - 1] ?? 0) - FADE;
    const out = i === files.length - 1 ? "vout" : `x${i}`;
    parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[${out}]`);
    last = out;
  }
  if (files.length === 1) parts.push("[v0]null[vout]");
  const total = seconds.reduce((a, b) => a + b, 0) - FADE * (files.length - 1);
  return ["-y", ...inputs, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-filter_complex", parts.join(";"), "-map", "[vout]", "-map", `${files.length}:a`,
    "-t", total.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "64k", "-ar", "44100", "-movflags", "+faststart", output];
}

async function dataUri(url: string, fetchFn: typeof fetch): Promise<string | undefined> {
  try {
    const r = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${r.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Render the silent captioned MP4 (Ozzy art + the trade's sample-ad poster fetched from the public site). */
export async function renderReel(s: ReelScript, signal?: AbortSignal, fetchFn: typeof fetch = fetch): Promise<Buffer> {
  const art: Record<string, string | undefined> = {};
  for (const name of new Set(s.scenes.map((x) => x.art).filter((a): a is string => Boolean(a && a !== "poster")))) art[name] = await dataUri(`${SITE}/brand/${name}`, fetchFn);
  const poster = REEL_TRADES.find((t) => t.slug === s.trade)?.poster;
  if (poster) art.poster = await dataUri(`${SITE}/studio-examples/${poster}.jpg`, fetchFn);
  const frames = reelFrames(s, art);
  const dir = await mkdtemp(path.join(tmpdir(), "reel-"));
  try {
    const files: string[] = [];
    for (const [i, f] of frames.entries()) {
      const p = path.join(dir, `s${i}.png`);
      await writeFile(p, await sharp(Buffer.from(f.svg)).png().toBuffer());
      files.push(p);
    }
    const out = path.join(dir, "out.mp4");
    await runFfmpeg(reelVideoArgs(files, frames.map((f) => f.seconds), out), signal);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const startOfEtDay = (now: Date) => new Date(`${etDay(now)}T00:00:00Z`).getTime() - 24 * 3_600_000; // generous: ET day starts within 24h of this

export interface ReelsCycleDeps { db: Db; provider: AIProvider; storage: Storage; env: NodeJS.ProcessEnv; now: Date; fetch?: typeof fetch; render?: typeof renderReel }

/** One cycle: top up the backlog by at most one reel. Returns reel ids created. */
export async function reelsCycle(d: ReelsCycleDeps): Promise<{ created: string[]; skipped?: string }> {
  const { db, now, env } = d;
  const cap = dailyCap(env);
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const readyEv = await db.adsEvent.findMany({ where: { name: REEL_EVENTS.ready, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 500, select: { props: true, createdAt: true } });
  const ready = readyEv.map((e) => e.props as unknown as ReelReadyProps);
  const published = await db.adsEvent.findMany({ where: { name: REEL_EVENTS.published, createdAt: { gte: since } }, select: { props: true }, take: 1000 });
  const publishedIds = new Set(published.map((e) => (e.props as { reelId?: string }).reelId));
  const backlog = ready.filter((r) => !publishedIds.has(r.reelId)).length;
  if (backlog >= cap + 1) return { created: [], skipped: `backlog ${backlog}` };
  const spendRows = await db.adsEvent.findMany({ where: { name: REEL_EVENTS.spend, createdAt: { gte: new Date(startOfEtDay(now)) } }, select: { props: true }, take: 500 });
  const spent = spendRows.reduce((a, e) => a + Number((e.props as { micros?: number }).micros ?? 0), 0);
  if (!withinCostCap(spent, GATE_COST_MICROS * 2, env)) return { created: [], skipped: "daily cost cap" };

  const insights = (await db.adsEvent.findMany({ where: { name: REEL_EVENTS.insights }, orderBy: { createdAt: "desc" }, take: 500, select: { props: true, createdAt: true } }))
    .map((e) => ({ ...(e.props as { reelId: string; platform: string; metrics?: Record<string, number> }), at: e.createdAt }));
  const perfs = perfsFromEvents(ready as ReadyLite[], insights);
  const day = etDay(now);
  const pick = nextHook(day, ready.length, ready.map((r) => ({ hookId: r.hookId, trade: r.trade, format: r.format, hash: r.hash })), perfs);
  if (!pick) return { created: [], skipped: "no fresh hook" };
  const script = buildScript(pick.hook, ctaDue(publishedIds.size));
  const bad = checkScript(script);
  if (bad) throw new Error(`script check failed for ${pick.hook.id}: ${bad}`);
  const captions = { facebook: buildCaption("facebook", script), instagram: buildCaption("instagram", script) };
  for (const p of ["facebook", "instagram"] as const) {
    const c = checkReelCaption(captions[p], p, { withCta: script.withCta, hookId: script.hookId });
    if (c) throw new Error(`caption check failed (${p}): ${c}`);
  }
  const id = reelId(pick.hook.id, day, ready.length + 1);
  const content = `ON-SCREEN:\n${script.scenes.map((s) => s.text).join("\n")}\n\nFACEBOOK CAPTION:\n${captions.facebook}\n\nINSTAGRAM CAPTION:\n${captions.instagram}`;
  const verdict = await gate(db, d.provider, { system: "reels", kind: "copy", itemKey: `reel:${id}`, content, facts: "Ozzy is Komendly's cartoon dingo mascot; videos are AI-made animations with on-screen text only. 'Before' ads are made-up examples. Offer: 10 free ads from your website, no card." });
  await db.adsEvent.create({ data: { name: REEL_EVENTS.spend, props: { micros: GATE_COST_MICROS, what: `review ${id}` } } }).catch(() => undefined);
  if (!verdict.approved) {
    log("info", "reels: review gate rejected", { id, reasons: verdict.verdict.reasons });
    return { created: [], skipped: "review gate rejected" };
  }
  const mp4 = await (d.render ?? renderReel)(script, undefined, d.fetch);
  const key = reelKey(id, "silent.mp4");
  const scriptKey = reelKey(id, "script.txt");
  await d.storage.put(key, mp4, "video/mp4");
  await d.storage.put(scriptKey, Buffer.from(`${script.voiceover}\n`), "text/plain");
  const props: ReelReadyProps = { reelId: id, hookId: pick.hook.id, trade: script.trade, format: script.format, seconds: script.seconds, withCta: script.withCta, hash: reelHash(pick.hook.id, "v1"), key, scriptKey, day, script: script.voiceover, captions, costMicros: GATE_COST_MICROS };
  await db.adsEvent.create({ data: { name: REEL_EVENTS.ready, props: props as unknown as object } });
  for (const p of QUEUE_PLATFORMS) {
    const q = buildQueueItem(p, script, id);
    if (typeof q === "string") log("warn", "reels: queue item skipped", { id, reason: q });
    else await db.adsEvent.create({ data: { name: REEL_EVENTS.queue, props: q as unknown as object } });
  }
  log("info", "reels: reel ready", { id, mode: pick.mode, seconds: script.seconds });
  return { created: [id] };
}

export function startReelsLoop(opts: { db: Db; storage: Storage; env?: NodeJS.ProcessEnv }): () => void {
  const env = opts.env ?? process.env;
  const intervalH = Number(env.REELS_INTERVAL_HOURS) > 0 ? Number(env.REELS_INTERVAL_HOURS) : 6;
  let provider: AIProvider | null = null;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!(await systemEnabled(opts.db, "reels"))) return;
      const beat = parseBeat((await opts.db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId("reels") } }))?.meta);
      const now = new Date();
      const waitH = beat.lastError ? 1 : intervalH;
      if (beat.lastRunAt && now.getTime() - new Date(beat.lastRunAt).getTime() < waitH * 3_600_000) return;
      provider ??= createProvider("codex", { ...env, TEXT_BRAIN: "codex" }, { db: opts.db, by: "engine" });
      try {
        const r = await reelsCycle({ db: opts.db, provider, storage: opts.storage, env, now });
        await recordSystemRun(opts.db, "reels", { ok: true, outputs: r.created.length });
      } catch (e) {
        await recordSystemRun(opts.db, "reels", { ok: false, error: errMsg(e) });
      }
    } catch (e) {
      log("warn", "reels tick failed", { error: errMsg(e) });
    } finally {
      busy = false;
    }
  };
  const t = setInterval(() => void tick(), 10 * 60_000);
  const first = setTimeout(() => void tick(), 45_000);
  return () => { clearInterval(t); clearTimeout(first); };
}

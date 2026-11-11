// EZMotion module entry (feature flag 'ezmotion'; dynamic-imported by the engine).
// Hybrid approach: one small LLM call picks a scene plan from the AdSpec/BrandKit, then a
// deterministic HyperFrames composition (paused GSAP timeline) is rendered per ratio.
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { RATIO_PIXELS, type Ratio } from "../../../../src/lib/ads/contracts";
import type { UsageMeter } from "../../providers/types";
import type { BrandKit } from "../../render/static/types";
import { buildPalette, contrast, luminance } from "./colors";
import { buildComposition, type CompAsset, pickStructure, sceneTimes } from "./composition";
import { resolveFonts } from "./fonts";
import { cliAvailable, runMotionAgent } from "./agent";
import { buildHype, buildScore, beatTime, type HypeAsset } from "./hype";
import { hypeOnScreenText, writeHypeScript } from "./hype-script";
import { captureLiveHero, lowValueMargins, thirdPartyGate, type VettedAsset, vetPhoto, vetProductAsset } from "./imagery";
import { frameFor } from "./layout";
import { makeScenePlate } from "./plate";
import { buildPlanBrief, defaultPlan, rankAssets, SCENE_PLAN_JSON_SCHEMA, type ScenePlan, sanitizePlan } from "./plan";
import { type FlashReport, chromePath, extractFrame, ffmpegPath, ffprobePath, finalizeMp4, flashCheck, gsapPath, hyperframesEntry, muxAudio, probe, renderComposition, synthScore } from "./runtime";
import type { MotionRenderInput, MotionRenderResult, RenderMotionAd } from "./types";
import { checkSafeZones, type SafeZoneReport } from "./safezone";

export type { MotionRenderInput, MotionRenderResult, RenderMotionAd } from "./types";

/** Scene plate on by default; EZMOTION_PLATE=0 is the kill-switch. */
export function plateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EZMOTION_PLATE !== "0";
}

/** Main real assets are screenshots (product UI). */
export function isSoftwareBrand(assets: ReadonlyArray<{ kind: string; hasFace: boolean }>): boolean {
  const main = assets.filter((a) => a.kind !== "icon" && !a.hasFace);
  const shots = main.filter((a) => a.kind === "screenshot").length;
  return shots > 0 && shots >= main.length / 2;
}

export const MAX_BYTES = 30 * 1024 * 1024;
const FPS = 30;

/** Gate: a video that fails the flash screen is never delivered. */
export function assertFlashSafe(report: FlashReport, ratio: Ratio): void {
  if (!report.ok) throw new Error(`Flash-safety check failed (${ratio}): ${JSON.stringify(report.raw).slice(0, 400)}`);
}

export async function isMotionAvailable(): Promise<{ ok: boolean; reason?: string }> {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) return { ok: false, reason: `node ${process.versions.node} < 22` };
  if (!hyperframesEntry()) return { ok: false, reason: "hyperframes package not installed" };
  if (!gsapPath()) return { ok: false, reason: "gsap package not installed" };
  if (!(await ffmpegPath())) return { ok: false, reason: "ffmpeg not found" };
  if (!(await ffprobePath())) return { ok: false, reason: "ffprobe not found" };
  if (!(await chromePath())) return { ok: false, reason: "Chrome not found (set PRODUCER_HEADLESS_SHELL_PATH or run `npx hyperframes browser ensure`)" };
  return { ok: true };
}

/** Ask the provider for a scene plan; any failure falls back to the deterministic plan. */
export async function planScenes(input: Pick<MotionRenderInput, "spec" | "brand" | "provider" | "maxSeconds" | "signal">): Promise<{ plan: ScenePlan; usage: UsageMeter[]; source: "llm" | "default"; fixes: string[] }> {
  const { system, prompt } = buildPlanBrief(input.spec, input.brand, input.maxSeconds);
  try {
    const signal = input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
    const res = await input.provider.text({ system, prompt, jsonSchema: SCENE_PLAN_JSON_SCHEMA, reasoning: "low", signal });
    const raw = res.json ?? JSON.parse(res.text);
    const { plan, fixes } = sanitizePlan(raw, input.spec, input.brand);
    return { plan, usage: [res.usage], source: fixes.includes("plan:invalid") ? "default" : "llm", fixes };
  } catch (e) {
    if (input.signal?.aborted) throw e;
    return { plan: defaultPlan(input.spec, input.brand), usage: [], source: "default", fixes: [`plan:error: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`] };
  }
}

async function logoInfo(path: string, bg: string): Promise<{ width: number; height: number; plate: boolean } | null> {
  try {
    const img = sharp(path, { density: 300 }).ensureAlpha();
    const meta = await img.metadata();
    const { data, info } = await img.resize(64, 64, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
    let lum = 0;
    let wsum = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const a = (data[i + 3] ?? 255) / 255;
      const l = (0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0)) / 255;
      lum += l * a;
      wsum += a;
    }
    const avg = wsum ? lum / wsum : 0.5;
    const hex = `#${Math.round(avg * 255).toString(16).padStart(2, "0").repeat(3)}`;
    // Opaque logos carry their own background; transparent ones need contrast with ours.
    const transparentShare = 1 - wsum / (data.length / info.channels);
    const plate = transparentShare > 0.05 && contrast(hex, bg) < 2;
    return { width: meta.width ?? 400, height: meta.height ?? 120, plate };
  } catch {
    return null;
  }
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
};

async function stageAsset(src: string, dir: string, name: string): Promise<string> {
  const file = `${name}${extname(src).toLowerCase() || ".png"}`;
  await copyFile(src, join(dir, file));
  return `assets/${file}`;
}

/**
 * Motion style: "agent" (default when @prestyj/cli is installed: the EZ Motion agent makes the video
 * from the website and a short brief), "hype" (deterministic fast-cut edit; the agent's fallback)
 * or "classic" (the earlier scene template).
 */
export function motionStyle(env: NodeJS.ProcessEnv = process.env): "agent" | "hype" | "classic" {
  if (env.EZMOTION_STYLE === "classic" || env.EZMOTION_STYLE === "hype") return env.EZMOTION_STYLE;
  return cliAvailable() ? "agent" : "hype";
}

export const renderMotionAd: RenderMotionAd = (input) => {
  const style = motionStyle();
  return style === "agent" ? renderAgentAd(input) : style === "hype" ? renderHypeAd(input) : renderClassicMotionAd(input);
};

/** The EZ Motion agent's video, checked like any render; falls back to the hype edit on any failure. */
export async function renderAgentAd(input: MotionRenderInput): Promise<MotionRenderResult> {
  const avail = await isMotionAvailable();
  if (!avail.ok) throw new Error(`EZMotion unavailable: ${avail.reason}`);
  const ratios: Ratio[] = input.ratios.length ? [...new Set(input.ratios)] : ["9:16"];
  const seconds = Math.max(10, Math.min(20, input.maxSeconds || 15));
  let fallbackWhy: string;
  try {
    const run = await runMotionAgent(input, ratios, seconds);
    if (run.ok) {
      const files: MotionRenderResult["files"] = [];
      let posterPath: string | undefined;
      for (const ratio of ratios) {
        const src = run.files[ratio];
        if (!src) continue;
        const out = join(input.workDir, `motion-${input.spec.index}-${ratio.replace(":", "x")}.mp4`);
        const fin = await finalizeMp4(src, out, MAX_BYTES, input.signal);
        if (!fin.ok) continue;
        const info = await probe(out, input.signal);
        const want = RATIO_PIXELS[ratio];
        // Wrong size or shape, or too long for a feed ad: not delivered.
        if (!info || info.durationSec > 60 || Math.abs(info.width / info.height - want.width / want.height) > 0.02 || info.width < want.width * 0.66) continue;
        if (!(await flashCheck(out, input.signal)).ok) continue;
        const bytes = (await stat(out)).size;
        files.push({ ratio, path: out, mime: "video/mp4", width: info.width, height: info.height, bytes, durationSec: Math.round(info.durationSec * 100) / 100 });
        if (!posterPath) {
          const p = join(input.workDir, `motion-${input.spec.index}-poster.jpg`);
          if (await extractFrame(out, Math.max(0, info.durationSec - 0.8), p, input.signal)) posterPath = p;
        }
      }
      // Every requested ratio must exist; a missing one is re-cut by the hype edit.
      const missing = ratios.filter((r) => !files.some((f) => f.ratio === r));
      if (files[0]?.ratio === ratios[0]) {
        const usage: MotionRenderResult["usage"] = [{ ...run.usage, latencyMs: run.ms }];
        if (missing.length) {
          const extra = await renderHypeAd({ ...input, ratios: missing, workDir: join(input.workDir, "hype-extra") });
          files.push(...extra.files);
          usage.push(...extra.usage);
        }
        return { files, posterPath, usage, onScreenText: run.text, meta: { style: "agent", agentMs: run.ms, missingRatios: missing, ...(run.safeZone ? { safeZone: run.safeZone } : {}), ...(run.renders ? { renders: run.renders } : {}), ...(run.motion ? { motion: run.motion } : {}), ...(run.music ? { music: run.music } : {}) } };
      }
      fallbackWhy = "agent video failed checks (size, length or flashing)";
    } else fallbackWhy = run.error ?? "agent failed";
  } catch (e) {
    if (input.signal?.aborted) throw e;
    fallbackWhy = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  const res = await renderHypeAd(input);
  return { ...res, meta: { ...(res.meta ?? {}), agentFallback: fallbackWhy } };
}

/** Up to `max` real site images for the montage: photos first (screenshots first for software brands), no faces. */
async function vetMontage(input: MotionRenderInput, max: number): Promise<VettedAsset[]> {
  const brand = input.brand;
  const software = isSoftwareBrand(brand.assets);
  const gate = thirdPartyGate(input.provider, input.signal);
  let gateCalls = 0;
  const accept = async (a: BrandKit["assets"][number]) => a.kind === "screenshot" || (gateCalls++ < 6 && (await gate(a)));
  const ranked = rankAssets(input.spec, brand)
    .filter((a) => !a.hasFace)
    .sort((a, b) => Number(software ? b.kind === "screenshot" : b.kind !== "screenshot") - Number(software ? a.kind === "screenshot" : a.kind !== "screenshot"));
  const out: VettedAsset[] = [];
  for (const a of ranked) {
    if (out.length >= max) break;
    const v = await vetProductAsset([a], accept);
    if (v) out.push(v);
  }
  return out;
}

const seedOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 9973;

export async function renderHypeAd(input: MotionRenderInput): Promise<MotionRenderResult> {
  const started = Date.now();
  const avail = await isMotionAvailable();
  if (!avail.ok) throw new Error(`EZMotion unavailable: ${avail.reason}`);
  const ratios: Ratio[] = input.ratios.length ? [...new Set(input.ratios)] : ["9:16"];
  const brand = input.brand;
  const brief = input.brief ?? {};
  const { script, usage, source, fixes } = await writeHypeScript(input.provider, input.spec, brand.brandName, brief, input.signal);
  const cta = (input.spec.cta?.trim() || "Learn more").slice(0, 28);
  const palette = buildPalette(brand.colors);
  const root = join(input.workDir, "ezmotion");
  await mkdir(root, { recursive: true });
  const gsap = gsapPath();
  if (!gsap) throw new Error("gsap missing");
  const montage = await vetMontage(input, 4);
  // No usable real image: the edit stays type-led (a page capture reads as clutter at hype speed).
  if (!montage.length) fixes.push("montage: none (type-led)");
  const dark = luminance(palette.bg) <= luminance(palette.ink) ? palette.bg : palette.ink;
  const light = dark === palette.bg ? palette.ink : palette.bg;
  const logo = brand.logoPath ? await logoInfo(brand.logoPath, dark) : null;
  const seed = seedOf(`${brand.brandName}:${input.spec.index}`);
  const files: MotionRenderResult["files"] = [];
  let posterPath: string | undefined;
  let audio: { music?: string; sfx?: string } | null = null;
  let planned: ReturnType<typeof buildHype> | null = null;
  let safeZone: SafeZoneReport | undefined;

  for (const ratio of ratios) {
    const frame = frameFor(ratio);
    const dir = join(root, `project-${ratio.replace(":", "x")}`);
    await mkdir(join(dir, "assets"), { recursive: true });
    const fonts = await resolveFonts(brand.fonts, dir, input.signal ?? AbortSignal.timeout(60_000));
    await copyFile(gsap, join(dir, "gsap.min.js"));
    const assets: HypeAsset[] = [];
    for (const [i, v] of montage.entries()) {
      assets.push({ src: await stageAsset(v.asset.path, join(dir, "assets"), `m${i}`), width: v.asset.width, height: v.asset.height, photo: !v.texty && v.asset.kind !== "screenshot" && v.asset.key !== "live-hero", focal: v.focal });
    }
    const built = buildHype({
      script,
      cta,
      frame,
      palette,
      brandName: brand.brandName,
      domain: domainOf(input.siteUrl),
      fontCss: fonts.css,
      headingFamily: fonts.heading,
      bodyFamily: fonts.body,
      logo: brand.logoPath && logo && Math.max(logo.width, logo.height) >= 160 ? { src: await stageAsset(brand.logoPath, join(dir, "assets"), "logo"), plate: logo.plate ? light : null } : null,
      assets,
      gsapSrc: "gsap.min.js",
      seed,
    });
    planned = built;
    await writeFile(join(dir, "index.html"), built.html);
    if (ratio === "9:16" && !safeZone) safeZone = await checkSafeZones(dir, ratio, { signal: input.signal });
    await writeFile(join(dir, "plan.json"), JSON.stringify({ style: "hype", source, fixes, script, shots: built.shots, palette, fonts: fonts.sources, montage: montage.map((m) => m.asset.key) }, null, 2));
    if (!audio) {
      const a = await synthScore(buildScore(built.shots, seed), join(root, "audio"), input.signal);
      audio = a.ok ? { music: a.music, sfx: a.sfx } : {};
      if (!a.ok) fixes.push(`audio: ${a.error ?? "failed"}`);
    }
    const raw = join(root, `raw-${basename(dir)}.mp4`);
    const r = await renderComposition(dir, raw, { fps: FPS, signal: input.signal });
    if (r.code !== 0) throw new Error(`HyperFrames render failed (${ratio}): ${(r.stderr || r.stdout).slice(-800)}`);
    let src = raw;
    if (audio.music && audio.sfx) {
      const withAudio = join(root, `mux-${basename(dir)}.mp4`);
      const m = await muxAudio(raw, audio.music, audio.sfx, withAudio, input.signal);
      if (m.ok) src = withAudio;
      else fixes.push(`mux: ${m.error ?? "failed"}`);
    }
    const out = join(input.workDir, `motion-${input.spec.index}-${ratio.replace(":", "x")}.mp4`);
    const fin = await finalizeMp4(src, out, MAX_BYTES, input.signal);
    if (!fin.ok) throw new Error(`MP4 finalize failed (${ratio}): ${fin.error}`);
    assertFlashSafe(await flashCheck(out, input.signal), ratio);
    const info = await probe(out, input.signal);
    const bytes = (await stat(out)).size;
    if (!info || bytes >= MAX_BYTES) throw new Error(`Output invalid or too large (${ratio}, ${bytes} bytes)`);
    files.push({ ratio, path: out, mime: "video/mp4", width: info.width, height: info.height, bytes, durationSec: Math.round(info.durationSec * 100) / 100 });
    if (!posterPath) {
      const end = built.shots.find((s) => s.kind === "end");
      const p = join(input.workDir, `motion-${input.spec.index}-poster.jpg`);
      if (end && (await extractFrame(out, beatTime(end.startBeat) + 1.6, p, input.signal))) posterPath = p;
    }
  }
  usage.push({ costMicros: 0, latencyMs: Date.now() - started });
  return {
    files,
    posterPath,
    usage,
    onScreenText: hypeOnScreenText(script, cta),
    meta: { style: "hype", scriptSource: source, fixes, cards: script.cards.length, cuts: planned?.shots.length ?? 0, montage: montage.length, ...(safeZone ? { safeZone } : {}) },
  };
}

export const renderClassicMotionAd: RenderMotionAd = async (input) => {
  const started = Date.now();
  const avail = await isMotionAvailable();
  if (!avail.ok) throw new Error(`EZMotion unavailable: ${avail.reason}`);
  const ratios: Ratio[] = input.ratios.length ? [...new Set(input.ratios)] : ["9:16"];
  const duration = Math.max(10, Math.min(14, input.maxSeconds || 14));
  const { plan, usage, source, fixes } = await planScenes({ ...input, maxSeconds: duration });
  const brand: BrandKit = input.brand;
  const palette = buildPalette(brand.colors, { bg: plan.backgroundHex ?? undefined, accent: plan.accentHex ?? undefined });
  const root = join(input.workDir, "ezmotion");
  const files: MotionRenderResult["files"] = [];
  let posterPath: string | undefined;
  const gsap = gsapPath();
  if (!gsap) throw new Error("gsap missing");
  const logo = brand.logoPath ? await logoInfo(brand.logoPath, palette.bg) : null;
  const find = (k: string | null) => (k ? brand.assets.find((a) => a.key === k) : undefined);
  const planned = find(plan.productAssetKey);
  await mkdir(input.workDir, { recursive: true });
  // With a plate, the real product photo leads (never a page crop).
  // Software/UI brands (screenshots lead) never get a generated plate: no invented UI or charts.
  const plateOn = plateEnabled() && !isSoftwareBrand(brand.assets);
  const gate = thirdPartyGate(input.provider, input.signal);
  const realPhoto = plateOn ? await vetPhoto(brand.assets, gate) : null;
  const vetted = realPhoto ?? await vetProductAsset([...(planned ? [planned] : []), ...rankAssets(input.spec, brand).filter((a) => a !== planned)], gate);
  // No site image passes: capture the live landing page hero instead.
  const live = vetted || process.env.EZMOTION_LIVE_SHOT === "0" ? null : await captureLiveHero(input.siteUrl, join(input.workDir, "live-hero.png"), input.signal).then((a) => (a ? vetProductAsset([a]) : null));
  if (live) fixes.push("product: live landing-page screenshot");
  const chosen = vetted ?? live;
  const prodA = chosen?.asset;
  // The shown product is page UI (screenshot or live capture): keep a brand-colour field, no plate.
  const uiShot = !!prodA && (prodA.kind === "screenshot" || prodA.key === "live-hero" || !!chosen?.texty);
  if (uiShot && plateOn) fixes.push("plate: skipped (UI product shot)");
  const structure = pickStructure(input.spec, prodA ?? null);
  if (planned && prodA !== planned) fixes.push(`product asset ${planned.key} rejected by image-quality filters`);
  const secA = find(plan.secondaryAssetKey);

  for (const ratio of ratios) {
    const frame = frameFor(ratio);
    const dir = join(root, `project-${ratio.replace(":", "x")}`);
    await mkdir(join(dir, "assets"), { recursive: true });
    const fonts = await resolveFonts(brand.fonts, dir, input.signal ?? AbortSignal.timeout(60_000));
    await copyFile(gsap, join(dir, "gsap.min.js"));
    const comp = async (a: typeof prodA, name: string): Promise<CompAsset | null> =>
      a ? { key: a.key, src: await stageAsset(a.path, join(dir, "assets"), name), width: a.width, height: a.height, hasFace: a.hasFace, kind: a.kind, ...(a === prodA && chosen ? { focal: chosen.focal, photo: chosen.asset.key !== "live-hero" && !chosen.texty && !isSoftwareBrand(brand.assets), trimmable: await lowValueMargins(a.path).catch(() => false) } : {}) } : null;
    const music = process.env.EZMOTION_MUSIC_PATH?.trim();
    // Premium plate (default; EZMOTION_PLATE=0 disables): text-free generated scene from real assets.
    // Any failure (no assets, image limits, QC rejects) falls back to the brand-colour field.
    let plate: string | null = null;
    if (plateOn && !uiShot) {
      const res = await makeScenePlate(input.provider, input.spec, brand, ratio, input.signal);
      usage.push(...res.usage);
      if (res.png) {
        await writeFile(join(dir, "assets", "plate.png"), res.png);
        plate = "assets/plate.png";
      } else fixes.push(`plate: ${res.reasons.join("; ")}`);
    }
    const html = buildComposition({
      spec: input.spec,
      plan,
      frame,
      palette,
      structure,
      plate,
      brandName: brand.brandName,
      domain: domainOf(input.siteUrl),
      durationSec: duration,
      fontCss: fonts.css,
      headingFamily: fonts.heading,
      bodyFamily: fonts.body,
      logo: brand.logoPath && logo ? { src: await stageAsset(brand.logoPath, join(dir, "assets"), "logo"), width: logo.width, height: logo.height, plate: logo.plate ? palette.ink : null } : null,
      product: await comp(prodA, "product"),
      secondary: await comp(secA, "secondary"),
      gsapSrc: "gsap.min.js",
      music: music ? { src: await stageAsset(music, join(dir, "assets"), "music"), volume: Number(process.env.EZMOTION_MUSIC_VOLUME ?? 0.18) } : null,
    });
    await writeFile(join(dir, "index.html"), html);
    await writeFile(join(dir, "plan.json"), JSON.stringify({ source, fixes, structure, plan, palette, fonts: fonts.sources }, null, 2));

    const raw = join(root, `raw-${basename(dir)}.mp4`);
    const r = await renderComposition(dir, raw, { fps: FPS, signal: input.signal });
    if (r.code !== 0) throw new Error(`HyperFrames render failed (${ratio}): ${(r.stderr || r.stdout).slice(-800)}`);
    const out = join(input.workDir, `motion-${input.spec.index}-${ratio.replace(":", "x")}.mp4`);
    const fin = await finalizeMp4(raw, out, MAX_BYTES, input.signal);
    if (!fin.ok) throw new Error(`MP4 finalize failed (${ratio}): ${fin.error}`);
    assertFlashSafe(await flashCheck(out, input.signal), ratio);
    const info = await probe(out, input.signal);
    const bytes = (await stat(out)).size;
    if (!info || bytes >= MAX_BYTES) throw new Error(`Output invalid or too large (${ratio}, ${bytes} bytes)`);
    files.push({ ratio, path: out, mime: "video/mp4", width: info.width, height: info.height, bytes, durationSec: Math.round(info.durationSec * 100) / 100 });
    if (!posterPath) {
      const p = join(input.workDir, `motion-${input.spec.index}-poster.jpg`);
      if (await extractFrame(out, sceneTimes(duration, structure).end.start + 2, p, input.signal)) posterPath = p;
    }
  }
  usage.push({ costMicros: 0, latencyMs: Date.now() - started });
  return { files, posterPath, usage };
};


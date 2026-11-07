// EZMotion module entry (feature flag 'ezmotion'; dynamic-imported by the engine).
// Hybrid approach: one small LLM call picks a scene plan from the AdSpec/BrandKit, then a
// deterministic HyperFrames composition (paused GSAP timeline) is rendered per ratio.
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import type { Ratio } from "../../../../src/lib/ads/contracts";
import type { UsageMeter } from "../../providers/types";
import type { BrandKit } from "../../render/static/types";
import { buildPalette, contrast } from "./colors";
import { buildComposition, type CompAsset, pickStructure, sceneTimes } from "./composition";
import { resolveFonts } from "./fonts";
import { captureLiveHero, lowValueMargins, thirdPartyGate, vetPhoto, vetProductAsset } from "./imagery";
import { frameFor } from "./layout";
import { makeScenePlate } from "./plate";
import { buildPlanBrief, defaultPlan, rankAssets, SCENE_PLAN_JSON_SCHEMA, type ScenePlan, sanitizePlan } from "./plan";
import { type FlashReport, chromePath, extractFrame, ffmpegPath, ffprobePath, finalizeMp4, flashCheck, gsapPath, hyperframesEntry, probe, renderComposition } from "./runtime";
import type { MotionRenderInput, MotionRenderResult, RenderMotionAd } from "./types";

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

export const renderMotionAd: RenderMotionAd = async (input) => {
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


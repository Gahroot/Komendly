// Premium static path: gpt-image-2 composes each ad from the spec + real assets; strict QC; logo overlaid.
// Throws ComposedRejectedError when QC fails twice so the caller can fall back to templates.
import path from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { AdSpec, Ratio } from "../../../../src/lib/ads/contracts";
import type { AIProvider, UsageMeter } from "../../providers/types";
import type { BrandKit, RenderedFile } from "../static/types";
import { overlayLogo, type Box } from "./logo-overlay";
import { buildComposedPrompt, renderedBody, type PromptStyle } from "./prompt";
import { buildReferences } from "./references";
import { GEN_SIZE, outPixels } from "./sizes";
import { dHash, tooSimilar } from "./diversity";
import { verifyText, type TextCheck } from "./verify-text";

/** Per-phase wall-clock totals (ms), summed over ratios and attempts. Instrumentation only. */
export interface ComposedTimings { refsMs: number; imageWaitMs: number; imageMs: number; verifyMs: number; logoMs: number; images: number }

export function newComposedTimings(): ComposedTimings {
  return { refsMs: 0, imageWaitMs: 0, imageMs: 0, verifyMs: 0, logoMs: 0, images: 0 };
}

export class ComposedRejectedError extends Error {
  constructor(readonly reasons: string[]) { super(`composed QC failed: ${reasons.join("; ")}`); }
}

export interface ComposedAd { png: Buffer; prompt: string; check: TextCheck; attempts: number; imageMs: number; usage: UsageMeter[]; failedReasons: string[]; hash: string; sceneShift: number; logo: { box: Box | null; kind: string | null } }

export async function composeAd(provider: AIProvider, spec: AdSpec, brand: BrandKit, style: PromptStyle, ratio: Ratio = "1:1", signal?: AbortSignal, avoidHashes: string[] = [], timings: ComposedTimings = newComposedTimings()): Promise<ComposedAd> {
  const t0 = Date.now();
  const refs = await buildReferences(spec, brand);
  timings.refsMs += Date.now() - t0;
  const usage: UsageMeter[] = [];
  let strictNote: string | undefined;
  let last: TextCheck | null = null;
  const failedReasons: string[] = [];
  let sceneShift = 0;
  let similarRetried = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildComposedPrompt({ spec, brand, refLabels: refs.map((r) => r.label), style, ratio, strictNote, sceneShift, hasScreens: refs.some((r) => r.screenshot) });
    const tImg = Date.now();
    const img = await provider.image({ prompt, size: GEN_SIZE[ratio], quality: "medium", references: refs.map(({ mediaType, base64 }) => ({ mediaType, base64 })), signal });
    usage.push(img.usage);
    const imgWall = Date.now() - tImg;
    timings.imageMs += img.usage.latencyMs;
    timings.imageWaitMs += Math.max(0, imgWall - img.usage.latencyMs); // limiter queue + auth
    timings.images++;
    const { width, height } = outPixels(ratio);
    const sized = await sharp(img.png).resize(width, height, { fit: "cover" }).png().toBuffer();
    const tVerify = Date.now();
    const check = await verifyText(provider, sized, { headline: spec.headline, cta: spec.cta, body: renderedBody(spec), brandName: brand.brandName, screenshotRef: refs.find((r) => r.screenshot), productRefs: refs.map(({ mediaType, base64 }) => ({ mediaType, base64 })) }, signal);
    timings.verifyMs += Date.now() - tVerify;
    usage.push({ costMicros: check.costMicros, latencyMs: 0 });
    last = check;
    const hash = check.ok ? await dHash(sized) : "";
    if (check.ok && !similarRetried && tooSimilar(hash, avoidHashes)) {
      // Near-duplicate of another ad in this run: one regeneration with a different scene.
      similarRetried = true;
      sceneShift = 1;
      failedReasons.push("too similar to another ad");
      continue;
    }
    if (check.ok) {
      const tLogo = Date.now();
      const { png, box, kind } = await overlayLogo(sized, brand.logoPath, { topLeftEmpty: check.read?.topLeftEmpty, textBoxes: check.read?.textBoxes ?? [], brandHexes: brand.colors.map((c) => c.hex), brandName: brand.brandName, headingFont: brand.fonts.find((f) => /head|display/i.test(f.role))?.family ?? brand.fonts[0]?.family });
      timings.logoMs += Date.now() - tLogo;
      return { png, prompt, check, attempts: attempt, imageMs: img.usage.latencyMs, usage, failedReasons, hash, sceneShift, logo: { box, kind } };
    }
    failedReasons.push(...check.reasons);
    if (attempt >= 2 && !similarRetried) break;
    strictNote = `STRICT: the previous version was rejected (${check.reasons.join("; ")}). Render ONLY the exact text above, nothing else.`;
  }
  throw Object.assign(new ComposedRejectedError(last?.reasons ?? ["unknown"]), { usage });
}

/** Renders all ratios; returns files in the same shape as the template renderer. */
export async function renderComposedAd(i: { spec: AdSpec; brand: BrandKit; ratios: Ratio[]; workDir: string; provider: AIProvider; signal?: AbortSignal; avoidHashes?: string[]; timings?: ComposedTimings }): Promise<{ files: RenderedFile[]; usage: UsageMeter[]; attempts: number; failedReasons: string[]; hash: string; sceneShift: number; logo: ComposedAd["logo"] }> {
  const files: RenderedFile[] = [];
  const usage: UsageMeter[] = [];
  let attempts = 0;
  let hash = "";
  let sceneShift = 0;
  let logo: ComposedAd["logo"] = { box: null, kind: null };
  const failedReasons: string[] = [];
  for (const ratio of i.ratios) {
    const r = await composeAd(i.provider, i.spec, i.brand, "lean", ratio, i.signal, i.avoidHashes, i.timings);
    if (!hash) { hash = r.hash; sceneShift = r.sceneShift; logo = r.logo; }
    usage.push(...r.usage);
    attempts += r.attempts;
    failedReasons.push(...r.failedReasons);
    const p = path.join(i.workDir, `composed-${i.spec.index}-${ratio.replace(":", "x")}.png`);
    await writeFile(p, r.png);
    const { width, height } = outPixels(ratio);
    files.push({ ratio, path: p, mime: "image/png", width, height, bytes: r.png.length });
  }
  return { files, usage, attempts, failedReasons, hash, sceneShift, logo };
}

// Static ad renderer: HTML/CSS templates -> Playwright Chromium screenshots at exact pixel sizes.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium, type Browser } from "playwright";
import type { AdSpec, Ratio } from "../../../../src/lib/ads/contracts";
import { RATIO_PIXELS } from "../../../../src/lib/ads/contracts";
import type { UsageMeter } from "../../providers/types";
import { buildPalette, type Palette } from "./color";
import { buildFontPlan } from "./fonts";
import { analyzeLogo } from "./logo";
import { inPageFit, type FitReport } from "./fit";
import { extractNumber, isImageTemplateId, matchTemplate, requestedTemplate, resolveTemplate, type TemplateId } from "./layout";
import { ensureImageContrast, type ContrastReport } from "./contrast-check";
import { chooseImages } from "./image-select";
import { imageLayoutsFor, loadImageMeta, regionDataUri, trimmedDataUri, type ImageMeta } from "./imagery";
import { fieldOf, renderTemplateHtml, toBullets, type TemplateCtx, type Visual } from "./templates";
import type { BrandKit, RenderedFile, RenderStaticAd, StaticRenderInput, StaticRenderResult } from "./types";

export type { BrandKit, RenderedFile, StaticRenderInput, StaticRenderResult } from "./types";
export { IMAGE_TEMPLATE_IDS, TEMPLATE_IDS, type ImageTemplateId, type TemplateId } from "./layout";
export { imageLayoutsFor } from "./imagery";

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export class StaticRenderError extends Error {
  constructor(
    readonly code: "text_overflow" | "file_too_large" | "low_contrast",
    message: string,
    readonly details: { ratio: Ratio; template: TemplateId; overflow?: string[] },
  ) {
    super(message);
    this.name = "StaticRenderError";
  }
}

export interface RatioReport {
  ratio: Ratio;
  template: TemplateId;
  fit: FitReport;
  /** Text-over-image check (image-led templates): final scrim strength + measured contrast. */
  contrast?: ContrastReport;
  /** Real asset keys used in this ratio. */
  assetKeys?: string[];
  /** Background field family this ad used (accent/dark/page/photo). */
  field?: string;
  /** Whether the spec's body copy is visible in the render (null when the spec has no body). */
  bodyShown?: boolean | null;
}

/** Normalised start of the body, matched against the page text to tell whether the layout showed it. */
export function bodyProbe(body: string | null | undefined): string | null {
  const n = (body ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return n ? n.slice(0, 28).trim() : null;
}

export interface DetailedStaticRenderResult extends StaticRenderResult {
  template: TemplateId;
  reports: RatioReport[];
}

const IMAGE_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".avif": "image/avif" };

async function dataUri(path: string): Promise<string> {
  const mime = IMAGE_MIME[extname(path).toLowerCase()] ?? "image/png";
  return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
}

/** Imagery prompt: supporting visuals only. Never people, faces, text, logos or UI. */
export function buildImageryPrompt(spec: AdSpec, palette: Palette): string {
  const subject = spec.visual.imageryPrompt ?? spec.visual.concept;
  return [
    `Photographic supporting image for a social ad: ${subject}.`,
    `Clean, modern, premium editorial look, natural light, shallow depth of field, uncluttered composition with calm negative space.`,
    `Colour mood that harmonises with ${palette.accent} and ${palette.bg}.`,
    `Strictly NO people, NO faces, NO hands, NO human figures.`,
    `Strictly NO text, letters, numbers, words, signage, logos, watermarks, labels, screens with UI, or user interfaces.`,
  ].join(" ");
}

function imageSize(ratios: Ratio[]): string {
  return ratios.some((r) => r !== "1:1") ? "1024x1536" : "1024x1024";
}

function quoteFrom(spec: AdSpec): TemplateCtx["quote"] {
  const c = spec.claims[0];
  if (!c) return null;
  let source = c.sourceUrl;
  try { source = new URL(c.sourceUrl).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
  const text = c.claim.replace(/^["“”'\s.…]+|["“”'\s]+$/g, "").trim();
  if (isQuoteFragment(text)) return null;
  return { text, source };
}

/** A quote that starts mid-sentence or is cut off (QC flags these; fall back to quote_thought). */
export function isQuoteFragment(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return true;
  if (/^[a-z]/.test(t)) return true;
  if (/^(and|but|or|so|because|which|that|to|of|with|for|than|as)\b/i.test(t)) return true;
  if (/(\.\.\.|…)$/.test(t) || /^(\.\.\.|…)/.test(text.trim())) return true;
  if (!/[.!?)"”]$/.test(t) && t.split(/\s+/).length > 6 && /\b(and|the|to|a|of|with|for|our|my|in)$/i.test(t)) return true;
  return false;
}

function statFrom(spec: AdSpec): TemplateCtx["stat"] {
  for (const c of spec.claims) {
    const value = extractNumber(c.claim);
    if (value) return { value, label: c.claim };
  }
  return null;
}

const TEXT_ALTS: TemplateId[] = ["minimal_type", "quote_thought", "offer_card", "pain_list", "ui_card", "hero_product", "stat_card"];

/** Field families already used 3 times in the set. */
function fullFields(used: string[]): string[] {
  return [...new Set(used)].filter((f) => used.filter((u) => u === f).length >= 3).sort();
}

function fitFor(kind: BrandKit["assets"][number]["kind"]): Visual["fit"] {
  return kind === "photo" || kind === "illustration" ? "cover" : "contain";
}

async function pickVisuals(spec: AdSpec, brand: BrandKit): Promise<{ real: Visual | null; scene: Visual | null }> {
  const wanted = spec.visual.assetKeys
    .map((k) => brand.assets.find((a) => a.key === k))
    .filter((a): a is BrandKit["assets"][number] => a !== undefined);
  // No (resolvable) keys: use the brand's own crisp screenshots/products, faces excluded.
  if (!wanted.length) {
    const fallback = brand.assets.filter((a) => !a.hasFace && (a.kind === "screenshot" || a.kind === "product") && a.width >= 600)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    const pick = fallback[Math.abs(spec.index) % Math.max(1, fallback.length)];
    if (pick) wanted.push(pick);
  }
  // Faces can only be shown uncropped (small), so prefer a face-free screenshot/product for the hero slot.
  const faceFree = (a: BrandKit["assets"][number]) => !a.hasFace && (a.kind === "screenshot" || a.kind === "product") && a.width >= 600;
  const first = wanted.find((a) => !a.hasFace) ?? brand.assets.filter(faceFree).sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? wanted[0];
  // Full-bleed scenes only from photos/illustrations without faces (screenshots would be cropped).
  const sceneAsset = wanted.find((a) => !a.hasFace && (a.kind === "photo" || a.kind === "illustration"));
  // Strips/device frames are wide (~1.6:1): tall screenshots get a clean region crop.
  const bandable = first && !first.hasFace && (first.kind === "screenshot" || first.kind === "product");
  const bands: Array<{ aspect: number; uri: string }> = [];
  if (bandable) for (const aspect of [1.4, 2, 2.8]) { const b = await regionDataUri(first.path, aspect); if (b) bands.push(b); }
  return {
    real: first ? { uri: (!first.hasFace && (first.kind === "screenshot" || first.kind === "product") ? await trimmedDataUri(first.path) : null) ?? await dataUri(first.path), hasFace: first.hasFace, generated: false, fit: fitFor(first.kind), aspect: first.width && first.height ? first.width / first.height : undefined, bands: bands.length ? bands : undefined } : null,
    scene: sceneAsset ? { uri: await dataUri(sceneAsset.path), hasFace: false, generated: false, fit: "cover" } : null,
  };
}

/** Drop flat-colour images and text-heavy photos (banners/og graphics) before choosing; screenshots stay (shown whole in frames). */
async function usableImageAssets(assets: BrandKit["assets"], load: (a: BrandKit["assets"][number]) => Promise<ImageMeta | null>): Promise<BrandKit["assets"]> {
  const out: BrandKit["assets"] = [];
  for (const a of assets) {
    if (a.kind === "screenshot") { out.push(a); continue; }
    if (a.kind === "icon" || a.kind === "other") continue;
    const m = await load(a);
    if (!m || (m.flat && !m.alpha) || m.texty) continue;
    out.push(a);
  }
  return out;
}

function siteDomain(brand: BrandKit): string | null {
  for (const a of brand.assets) {
    try { return new URL(a.sourceUrl).hostname.replace(/^www\./, ""); } catch { /* next */ }
  }
  return null;
}

export async function renderStaticAdWith(browser: Browser, input: StaticRenderInput): Promise<DetailedStaticRenderResult> {
  const { spec, brand, ratios, workDir, provider, signal } = input;
  const logoInfo = brand.logoPath ? await analyzeLogo(brand.logoPath) : null;
  const palette = buildPalette(brand.colors, logoInfo?.vivid ?? null);
  const fonts = buildFontPlan(brand.fonts);
  const usage: UsageMeter[] = [];
  const { real, scene } = await pickVisuals(spec, brand);

  let generated: Visual | null = null;
  if (spec.visual.generateImagery) {
    const img = await provider.image({ prompt: buildImageryPrompt(spec, palette), size: imageSize(ratios), quality: "high", background: "opaque", signal });
    usage.push(img.usage);
    generated = { uri: `data:image/png;base64,${img.png.toString("base64")}`, hasFace: false, generated: true, fit: "cover" };
  }

  const sceneVisual = scene ?? generated;
  const anyVisual = real ?? generated;
  // Unnamed layouts: alternate image-led templates in when the brand has real imagery.
  const imageIds = imageLayoutsFor(brand);
  let requested = requestedTemplate(spec);
  if (!matchTemplate(spec) && imageIds.length && spec.index % 2 === 0) {
    requested = (imageIds[Math.floor(spec.index / 2) % imageIds.length] ?? requested) as TemplateId;
  }
  const caps = {
    hasNumber: statFrom(spec) !== null,
    hasQuote: quoteFrom(spec) !== null,
    hasVisual: anyVisual !== null,
    hasSceneVisual: sceneVisual !== null,
  };
  const pick = (id: TemplateId) => (isImageTemplateId(id) ? id : resolveTemplate(id, caps));
  const used = input.usedTemplates ?? [];
  // Split-photo layouts read as one composition: count the family together.
  const fam = (id: string) => (id === "photo_split" || id === "photo_before_after" ? "split" : id);
  const full = (id: TemplateId) => used.filter((u) => fam(u) === fam(id)).length >= 2;
  // Least-used text template (ties rotate by ad index) so fallbacks spread instead of flooding one layout.
  const textFallback = (): TemplateId => {
    const alts = [...new Set(TEXT_ALTS.map((id) => resolveTemplate(id, caps)))];
    const count = (id: TemplateId) => used.filter((u) => u === id).length;
    const min = Math.min(...alts.map(count));
    const best = alts.filter((id) => count(id) === min);
    return best[Math.abs(spec.index) % Math.max(1, best.length)] ?? "minimal_type";
  };
  let template = pick(requested);
  if (full(template)) {
    // Set variety: rotate through image-led layouts, then text layouts, deterministically by ad index.
    const textAlts = TEXT_ALTS;
    const alts = [...imageIds, ...textAlts].map((id) => pick(id as TemplateId)).filter((id) => !full(id));
    template = alts[Math.abs(spec.index) % Math.max(1, alts.length)] ?? template;
  }
  const metaCache = new Map<string, ImageMeta | null>();
  const loadMeta = async (a: BrandKit["assets"][number]) => {
    if (!metaCache.has(a.key)) metaCache.set(a.key, await loadImageMeta(a));
    return metaCache.get(a.key) ?? null;
  };
  const domain = siteDomain(brand);
  const visual = template === "problem_scene" || template === "notification" ? sceneVisual : anyVisual;
  const logoUri = logoInfo?.uri ?? (brand.logoPath ? await dataUri(brand.logoPath) : null);

  await mkdir(workDir, { recursive: true });
  const files: RenderedFile[] = [];
  const reports: RatioReport[] = [];
  for (const ratio of ratios) {
    signal?.throwIfAborted();
    const { width, height } = RATIO_PIXELS[ratio];
    let rid: TemplateId = template;
    let images: ImageMeta[] = [];
    if (isImageTemplateId(template)) {
      const usable = await usableImageAssets(brand.assets, loadMeta);
      let choice = chooseImages(template, usable, ratio, spec.visual.assetKeys, spec.index);
      // Downgrades (e.g. faces -> photo_split) can still saturate a template; try the other image layouts.
      for (const alt of imageIds) {
        if (!full(choice.template)) break;
        const c = chooseImages(alt as typeof template, usable, ratio, spec.visual.assetKeys, spec.index);
        if (!full(c.template)) choice = c;
      }
      // No image layout fits (or all are saturated): spread across text templates when a set is tracked.
      if (full(choice.template) || (used.length && !isImageTemplateId(choice.template))) choice = { ...choice, template: textFallback(), assets: [] };
      images = (await Promise.all(choice.assets.map(loadMeta))).filter((m): m is ImageMeta => m !== null);
      rid = choice.template;
      if (isImageTemplateId(rid) && images.length < choice.assets.length) rid = images.length ? "photo_split" : "quote_thought";
      if (!isImageTemplateId(rid)) rid = resolveTemplate(rid, caps);
    }
    const ctx: TemplateCtx = {
      id: rid, images, domain, variant: spec.index, fullFields: fullFields(input.usedFields ?? []), ratio, palette, fonts, brandName: brand.brandName, logoUri, logoInfo,
      headline: spec.headline, hook: spec.hook, body: spec.body ?? null, cta: spec.cta ?? null,
      bullets: toBullets(spec.body), quote: quoteFrom(spec), stat: statFrom(spec), visual,
    };
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    try {
      // tsx/esbuild may inject __name() into serialised functions.
      await page.addInitScript("globalThis.__name = (f) => f;");
      await page.setContent(renderTemplateHtml(ctx), { waitUntil: "load", timeout: 30_000 });
      await page.evaluate("globalThis.__name = globalThis.__name || ((f) => f);");
      const fit = await page.evaluate(inPageFit, fonts.families);
      if (!fit.ok) {
        reports.push({ ratio, template: rid, fit });
        throw new StaticRenderError("text_overflow", `Ad ${spec.index} (${rid}, ${ratio}) overflows at minimum font size: ${fit.overflow.join(", ")}`, { ratio, template: rid, overflow: fit.overflow });
      }
      const contrast = (await ensureImageContrast(page, width, height)) ?? undefined;
      const probe = bodyProbe(spec.body);
      const pageText = probe ? String(await page.evaluate("document.body.innerText")) : "";
      const bodyShown = probe ? pageText.toLowerCase().replace(/[^a-z0-9]+/g, " ").includes(probe) : null;
      reports.push({ ratio, template: rid, fit, contrast, assetKeys: images.map((m) => m.key), field: fieldOf(ctx), bodyShown });
      if (contrast && !contrast.ok) {
        throw new StaticRenderError("low_contrast", `Ad ${spec.index} (${rid}, ${ratio}) text over image below AA even at full scrim: ${JSON.stringify(contrast.contrast)}`, { ratio, template: rid });
      }
      const base = join(workDir, `ad-${spec.index}-${ratio.replace(":", "x")}`);
      const clip = { x: 0, y: 0, width, height };
      const png = await page.screenshot({ type: "png", clip, animations: "disabled" });
      const jpg = await page.screenshot({ type: "jpeg", quality: 92, clip, animations: "disabled" });
      for (const [buf, ext, mime] of [[png, "png", "image/png"], [jpg, "jpg", "image/jpeg"]] as const) {
        const path = `${base}.${ext}`;
        await writeFile(path, buf);
        const bytes = (await stat(path)).size;
        if (bytes >= MAX_FILE_BYTES) throw new StaticRenderError("file_too_large", `${path} is ${bytes} bytes`, { ratio, template: rid });
        files.push({ ratio, path, mime, width, height, bytes });
      }
    } finally {
      await page.close();
    }
  }
  return { files, usage, template, reports };
}

export async function launchRenderBrowser(): Promise<Browser> {
  return chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
}

export const renderStaticAd: RenderStaticAd = async (input) => {
  const browser = await launchRenderBrowser();
  try {
    const { files, usage } = await renderStaticAdWith(browser, input);
    return { files, usage };
  } finally {
    await browser.close();
  }
};

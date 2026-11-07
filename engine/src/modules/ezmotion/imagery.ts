// Vets product shots with the static renderer's image-quality helpers (flat / texty / low-res / faces).
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { AIProvider } from "../../providers/types";
import { verifyText } from "../../render/composed/verify-text";
import { isLowRes, loadImageMeta } from "../../render/static/imagery";
import type { BrandKit } from "../../render/static/types";

type Asset = BrandKit["assets"][number];
/** Extra per-asset gate (e.g. the third-party brand check); runs only after the cheap pixel checks pass. */
export type Accept = (a: Asset) => Promise<boolean>;
const okAll: Accept = () => Promise.resolve(true);
/** `texty`: baked-in text/UI (a real page capture); false = reads as a photo. */
export interface VettedAsset { asset: Asset; focal: { x: number; y: number }; texty: boolean }

/** First usable asset in preference order: never flat textures, texty graphics only if they are screenshots, no tiny images. */
export async function vetProductAsset(candidates: Asset[], accept: Accept = okAll): Promise<VettedAsset | null> {
  for (const a of candidates) {
    const m = await loadImageMeta(a);
    if (!m || m.flat) continue;
    if (m.texty && a.kind !== "screenshot") continue;
    if (a.kind === "screenshot" ? m.width < 900 : isLowRes(m, 1080, 1080) && !a.hasFace) continue;
    if (!(await accept(a))) continue;
    return { asset: a, focal: m.focal, texty: m.texty };
  }
  return null;
}

const HIDE_OVERLAYS = `[id*=cookie i],[class*=cookie i],[id*=consent i],[class*=consent i],[id*=gdpr i],[class*=gdpr i],[aria-label*=cookie i],[id*=onetrust i],[class*=cky-] ,#CybotCookiebotDialog,[class*=intercom],[id*=intercom],[class*=crisp],[id*=hubspot-messages]{display:none!important}`;

/** Box (page px) to crop a 1440-wide landing page to: the biggest visual near the top, padded, else the first screen under the nav. */
export function heroCrop(visual: { x: number; y: number; width: number; height: number } | null, pageH: number): { x: number; y: number; width: number; height: number } {
  const W = 1440;
  if (!visual || visual.width < 400 || visual.height < 250) return { x: 0, y: 0, width: W, height: Math.min(pageH, 1000) };
  const pad = 60;
  const width = Math.min(W, Math.max(960, visual.width + pad * 2));
  const x = Math.round(Math.min(W - width, Math.max(0, visual.x + visual.width / 2 - width / 2)));
  const y = Math.max(0, Math.round(visual.y - pad));
  return { x, y, width, height: Math.round(Math.min(pageH - y, Math.max(640, visual.height + pad * 2))) };
}

/** Clean live screenshot of the landing page hero/product region (1440 wide, overlays hidden). Null on any failure. */
export async function captureLiveHero(url: string, outPath: string, signal?: AbortSignal): Promise<Asset | null> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
  const abort = () => void browser.close();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.addInitScript("window.__name = (f) => f");
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 }).catch(() => undefined);
    await page.addStyleTag({ content: HIDE_OVERLAYS }).catch(() => undefined);
    // Fixed bottom bars / modals over the hero are overlays too.
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const cs = getComputedStyle(el);
        if ((cs.position === "fixed" || cs.position === "sticky") && el.getBoundingClientRect().top > 200) el.style.display = "none";
        if (cs.position === "fixed" && el.getBoundingClientRect().height > 600) el.style.display = "none";
      }
    });
    await page.waitForTimeout(1200);
    const found = await page.evaluate(() => {
      let best: { x: number; y: number; width: number; height: number } | null = null;
      for (const el of Array.from(document.querySelectorAll("img,video,canvas,picture,svg"))) {
        const r = el.getBoundingClientRect();
        const y = r.top + window.scrollY;
        if (y > 1400 || r.width < 400 || r.height < 250) continue;
        if (!best || r.width * r.height > best.width * best.height) best = { x: r.left, y, width: r.width, height: r.height };
      }
      return { best, pageH: document.documentElement.scrollHeight };
    });
    const clip = heroCrop(found.best, Math.max(900, found.pageH));
    await page.screenshot({ path: outPath, clip, fullPage: true });
    return { key: "live-hero", sourceUrl: url, kind: "screenshot", width: clip.width, height: clip.height, hasFace: false, path: outPath };
  } catch {
    return null;
  } finally {
    signal?.removeEventListener("abort", abort);
    await browser.close().catch(() => undefined);
  }
}

/** Real product/photo shown whole in a card (no full-bleed, so low-res is fine): no faces, not flat, not a text graphic. */
export async function vetPhoto(assets: Asset[], accept: Accept = okAll): Promise<VettedAsset | null> {
  const rank = { product: 0, photo: 1, illustration: 2 } as Record<string, number>;
  const cands = assets.filter((a) => a.kind in rank && !a.hasFace && Math.min(a.width, a.height) >= 400).sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || b.width * b.height - a.width * a.height || a.key.localeCompare(b.key));
  for (const a of cands) {
    const m = await loadImageMeta(a);
    if (m && !m.flat && !m.texty && (await accept(a))) return { asset: a, focal: m.focal, texty: false };
  }
  return null;
}

/**
 * Vision check reused from the composed renderer's QC: rejects real photos that prominently
 * show another company's logo or signage. Screenshots (the brand's own UI) are not checked.
 * The verdict is cached in a sidecar file next to the asset, so each asset is checked once.
 */
export function thirdPartyGate(provider: AIProvider, signal?: AbortSignal): Accept {
  return async (a) => {
    if (a.kind === "screenshot") return true;
    const cache = `${a.path}.thirdparty.json`;
    try {
      return (JSON.parse(await readFile(cache, "utf8")) as { ok: boolean }).ok;
    } catch { /* not checked yet */ }
    let ok = true;
    try {
      const png = await sharp(a.path).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const check = await verifyText(provider, png, { headline: "", brandName: "" }, signal);
      ok = !check.read?.hasThirdPartyBrand;
    } catch (e) {
      if (signal?.aborted) throw e;
      return true; // check unavailable: fall back to the pixel checks only (not cached)
    }
    await writeFile(cache, JSON.stringify({ ok })).catch(() => undefined);
    return ok;
  };
}

/**
 * Whether a 1.2x push-in may trim the outer 8.3% band of a UI screenshot. True only when that
 * band is low-value: an empty page margin (near-uniform), or colourful wallpaper around neutral
 * app UI (band clearly more saturated than the centre). Page content at the edges -> false.
 */
export async function lowValueMargins(path: string): Promise<boolean> {
  const { data, info } = await sharp(path).resize(240, 240, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, m = 0.0833;
  const s = { b: { n: 0, flat: 0, sat: 0 }, c: { n: 0, flat: 0, sat: 0 } };
  const lum = (i: number) => 0.3 * (data[i] ?? 0) + 0.59 * (data[i + 1] ?? 0) + 0.11 * (data[i + 2] ?? 0);
  for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) {
    const i = (y * w + x) * 3;
    const g = Math.abs(lum(i) - lum(i - 3)) + Math.abs(lum(i) - lum(i - w * 3));
    const mx = Math.max(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0), mn = Math.min(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    const r = s[x < w * m || x > w * (1 - m) || y < h * m || y > h * (1 - m) ? "b" : "c"];
    r.n++;
    if (g < 3) r.flat++;
    r.sat += mx ? (mx - mn) / mx : 0;
  }
  const bandFlat = s.b.flat / Math.max(1, s.b.n), bandSat = s.b.sat / Math.max(1, s.b.n), centreSat = s.c.sat / Math.max(1, s.c.n);
  return bandFlat > 0.9 || (centreSat < 0.3 && bandSat > centreSat + 0.12);
}

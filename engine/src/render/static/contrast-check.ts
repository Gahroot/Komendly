// Post-render AA check of text drawn over real imagery: sample the pixels under each
// [data-contrast] element (text hidden) and strengthen the scrim until it passes.
import type { Page } from "playwright";
import sharp from "sharp";
import { luminance } from "./color";

export interface Rect { x: number; y: number; width: number; height: number }

/** Contrast that `share` of the region's pixels reach against `text` (default: 97% of pixels). */
export function regionContrast(raw: Buffer, imgW: number, imgH: number, channels: number, rect: Rect, text: string, share = 0.97): number {
  const lt = luminance(text);
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(imgW, Math.ceil(rect.x + rect.width)), y1 = Math.min(imgH, Math.ceil(rect.y + rect.height));
  const ratios: number[] = [];
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * imgW + x) * channels;
    const l = 0.2126 * lin(raw[i] ?? 0) + 0.7152 * lin(raw[i + 1] ?? 0) + 0.0722 * lin(raw[i + 2] ?? 0);
    ratios.push((Math.max(l, lt) + 0.05) / (Math.min(l, lt) + 0.05));
  }
  if (!ratios.length) return 21;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor((1 - share) * (ratios.length - 1))] ?? 21;
}

export interface ContrastReport { scrim: number; contrast: Record<string, number>; ok: boolean }

interface Target extends Rect { key: string; color: string; min: number }

export async function ensureImageContrast(page: Page, width: number, height: number): Promise<ContrastReport | null> {
  const targets = (await page.evaluate(`[...document.querySelectorAll("[data-contrast]")].map((e) => { const r = e.getBoundingClientRect(); return { key: e.dataset.key || "text", x: r.x, y: r.y, width: r.width, height: r.height, color: e.dataset.contrast, min: Number(e.dataset.cmin || 4.5) }; })`)) as Target[];
  if (!targets.length) return null;
  // Solid part of the scrim reaches 48px above the highest text line.
  const top = Math.min(...targets.map((t) => t.y));
  const tz = Math.min(100, ((height - top + 48) / height) * 100);
  let s = 0.55;
  for (let step = 0; ; step++) {
    await page.evaluate(`(() => { const a = document.querySelector(".ad"); a.style.setProperty("--s", "${s.toFixed(2)}"); a.style.setProperty("--tz", "${tz.toFixed(1)}%"); document.body.classList.add("measuring"); })()`);
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height }, animations: "disabled" });
    await page.evaluate(`document.body.classList.remove("measuring")`);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const contrast: Record<string, number> = {};
    let ok = true;
    for (const t of targets) {
      const c = regionContrast(data, info.width, info.height, info.channels, t, t.color);
      contrast[t.key] = Math.round(c * 100) / 100;
      if (c < t.min) ok = false;
    }
    if (ok || s >= 1) return { scrim: s, contrast, ok };
    s = Math.min(1, s + 0.15);
  }
}

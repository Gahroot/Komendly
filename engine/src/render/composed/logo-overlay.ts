// Places the real logo crisply (min ~14% of frame width) in a corner that touches no ad text.
// Text boxes come from the vision read-back; the pixel check also rejects busy corners.
// A solid brand-colour chip (no outline) is added only when the logo would lack contrast.
import sharp, { type OverlayOptions } from "sharp";
import { crispLogo, shortBrandName, wordmark } from "./logo-source";

type Corner = "tl" | "tr" | "bl" | "br";
export interface Box { x: number; y: number; w: number; h: number } // fractions 0-1
interface Region { left: number; top: number; width: number; height: number }
export const LOGO_MIN_W = 0.14;
export const BUSY_STD = 45;

async function regionStats(img: Buffer, r: Region): Promise<{ std: number; lum: number }> {
  const s = await sharp(img).extract(r).greyscale().stats();
  const c = s.channels[0];
  return { std: c?.stdev ?? 99, lum: c?.mean ?? 128 };
}

function lumOf(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return 128;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/** Brand colour that contrasts most with the logo, else black/white. */
export function chipColour(logoLum: number, brandHexes: string[]): string {
  const best = [...brandHexes].sort((a, b) => Math.abs(lumOf(b) - logoLum) - Math.abs(lumOf(a) - logoLum) || a.localeCompare(b))[0];
  if (best && Math.abs(lumOf(best) - logoLum) >= 90) return best;
  return logoLum > 128 ? "#111111" : "#ffffff";
}

/** Share of logo pixels (luminances) that differ from a ground by at least `min` (legible against it). */
export function legibleShare(lums: number[], groundLum: number, min = 70): number {
  if (!lums.length) return 1;
  return lums.filter((l) => Math.abs(l - groundLum) >= min).length / lums.length;
}

/**
 * Chip colour for a logo with mixed tones (e.g. white icon + dark lettering): the candidate (brand colours,
 * near-white, near-black) against which the most logo pixels stay legible. Mean luminance alone picks a
 * black chip for such logos and hides the dark lettering.
 */
export function chipForLogo(lums: number[], brandHexes: string[]): string {
  const cands = [...brandHexes, "#ffffff", "#111111"];
  return [...cands].sort((a, b) => legibleShare(lums, lumOf(b)) - legibleShare(lums, lumOf(a)) || a.localeCompare(b))[0] ?? "#ffffff";
}

/** True when region r (pixels) overlaps any text box (fractions), with a small margin. */
export function hitsText(r: Region, W: number, H: number, boxes: Box[], margin = 0.015): boolean {
  return boxes.some((b) => {
    const x0 = (b.x - margin) * W, y0 = (b.y - margin) * H, x1 = (b.x + b.w + margin) * W, y1 = (b.y + b.h + margin) * H;
    return r.left < x1 && r.left + r.width > x0 && r.top < y1 && r.top + r.height > y0;
  });
}

/** Mean luminance of the logo's opaque pixels only (transparent areas ignored). */
async function logoLuminances(logo: Buffer): Promise<number[]> {
  const { data, info } = await sharp(logo).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out: number[] = [];
  const step = Math.max(1, Math.floor(data.length / info.channels / 20000)) * info.channels; // sample <= ~20k px
  for (let i = 0; i < data.length; i += step) {
    const a = data[i + 3] ?? 0;
    if (a < 128) continue;
    out.push(0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0));
  }
  return out;
}

export async function overlayLogo(ad: Buffer, logoPath: string | null, opts: { topLeftEmpty?: boolean; brandHexes?: string[]; textBoxes?: Box[]; brandName?: string; headingFont?: string; domain?: string } = {}): Promise<{ png: Buffer; corner: Corner | null; chip: boolean; box: Box | null; kind: "file" | "wordmark" | null }> {
  const real = await crispLogo(logoPath);
  if (!real && !opts.brandName) return { png: ad, corner: null, chip: false, box: null, kind: null };
  const meta = await sharp(ad).metadata();
  const W = meta.width ?? 1024, H = meta.height ?? 1024;
  const pad = Math.round(W * 0.045);
  const sample = await regionStats(ad, { left: 0, top: 0, width: W, height: H });
  // Wordmark colour contrasts with the ad overall; replaced only if a corner chip is needed.
  const trimmed = real?.png ?? (await wordmark(shortBrandName(opts.brandName ?? "", opts.domain), opts.headingFont, Math.round(W * 0.22), sample.lum > 128 ? "#111111" : "#ffffff"));
  const tm = await sharp(trimmed).metadata();
  const aspect = (tm.width ?? 1) / (tm.height ?? 1);
  const logoLums = await logoLuminances(trimmed);
  const logoLum = logoLums.length ? logoLums.reduce((a, b) => a + b, 0) / logoLums.length : 128;
  const boxes = opts.textBoxes ?? [];
  const corners: Corner[] = ["tl", "tr", "bl", "br"];
  // Always place a logo. Preference: text-free calm corner > text-free busy corner (chip) > least-bad corner, smaller.
  for (const scale of [1, 0.8, 0.65]) {
    const minW = real ? 0 : W * 0.16;
    const lw = Math.round(Math.max(minW, Math.min(real?.nativeW ?? Number.POSITIVE_INFINITY, scale * Math.min(W * 0.24, Math.max(W * LOGO_MIN_W, Math.min(W * 0.24, W * 0.12 * aspect))))));
    const logo = await sharp(trimmed).resize({ width: lw }).png().toBuffer();
    const lh = (await sharp(logo).metadata()).height ?? Math.round(lw / aspect);
    const cp = Math.round(W * 0.018);
    const box = (c: Corner): Region => ({ left: c[1] === "l" ? pad : W - pad - lw - 2 * cp, top: c[0] === "t" ? pad : H - pad - lh - 2 * cp, width: lw + 2 * cp, height: lh + 2 * cp });
    const stats = await Promise.all(corners.map(async (c) => ({ c, free: !hitsText(box(c), W, H, boxes), ...(await regionStats(ad, box(c))) })));
    const free = stats.filter((s) => s.free && !(s.c === "tl" && opts.topLeftEmpty === false));
    const last = scale === 0.65;
    // Same corner across a set: top-left unless it is busy (std >= BUSY_STD) or holds text.
    const calm = free.find((s) => s.c === "tl" && s.std < BUSY_STD) ?? [...free].sort((a, b) => a.std - b.std)[0] ?? (last ? [...stats].sort((a, b) => a.std - b.std)[0] : undefined);
    if (!calm) continue;
    const r = box(calm.c);
    for (const forceChip of [false, true]) {
      // Chip only when contrast needs it (low luminance difference, textured ground, or touching text).
      const chip = forceChip || legibleShare(logoLums, calm.lum) < 0.85 || calm.std > 35 || !calm.free;
      const layers: OverlayOptions[] = [];
      if (chip) {
        const fill = chipForLogo(logoLums, opts.brandHexes ?? []);
        layers.push({ input: Buffer.from(`<svg width="${r.width}" height="${r.height}" xmlns="http://www.w3.org/2000/svg"><rect width="${r.width}" height="${r.height}" rx="${Math.round(cp * 1.2)}" fill="${fill}" stroke="none"/></svg>`), left: r.left, top: r.top });
      }
      layers.push({ input: logo, left: r.left + cp, top: r.top + cp });
      const out = await sharp(ad).composite(layers).png().toBuffer();
      // Blank check: the placed mark must be visible (e.g. not a white logo on a white ground).
      if ((await regionStats(out, r)).std < 12 && !forceChip) continue;
      return { png: out, corner: calm.c, chip, box: { x: r.left / W, y: r.top / H, w: r.width / W, h: r.height / H }, kind: real ? "file" : "wordmark" };
    }
  }
  return { png: ad, corner: null, chip: false, box: null, kind: null };
}

// Real site imagery: analysis (sharp), face-safe crop maths, low-res rules and which
// image-led templates a brand's assets can support. Pure helpers are exported for tests.
import sharp from "sharp";
import { IMAGE_TEMPLATE_IDS, type ImageTemplateId } from "./layout";
import type { BrandKit } from "./types";

export { IMAGE_TEMPLATE_IDS, type ImageTemplateId };

export type BrandAsset = BrandKit["assets"][number];
export interface Box { x: number; y: number; width: number; height: number } // normalised 0..1

export interface ImageMeta {
  key: string;
  path: string;
  uri: string;
  kind: BrandAsset["kind"];
  width: number;
  height: number;
  hasFace: boolean;
  faceBox: Box | null;
  alpha: boolean; // transparent cut-out (use as-is, no card)
  focal: { x: number; y: number }; // saliency centroid 0..1
  luminance: number; // mean relative luminance 0..1
  /** Likely has baked-in text (banner/og graphic): never crop; skip for photo layouts. */
  texty: boolean;
  /** Mostly flat colour: useless as a photo. */
  flat: boolean;
  sourceUrl: string;
}

/** Source pixels below this on the frame's long edge are not stretched full-bleed. */
export const MIN_FULLBLEED_EDGE = 800;
export const PHOTO_KINDS: ReadonlyArray<BrandAsset["kind"]> = ["photo", "product", "illustration"];

/** Source pixels that end up covering the frame's long edge with object-fit: cover. */
export function coverSourceEdge(img: { width: number; height: number }, frameW: number, frameH: number): number {
  const s = Math.max(frameW / img.width, frameH / img.height);
  return Math.round(Math.max(frameW, frameH) / s);
}

export function isLowRes(img: { width: number; height: number }, frameW: number, frameH: number): boolean {
  return coverSourceEdge(img, frameW, frameH) < MIN_FULLBLEED_EDGE;
}

export interface Placement {
  fit: "cover" | "contain";
  /** CSS object-position, e.g. "42.0% 0.0%". */
  position: string;
  /** Visible source window (normalised) when cover. */
  window: Box;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Cover-crop window for a frame, centred on the focal point. With a face box the window
 * keeps the whole face in frame and, when `faceZone` is given, inside that vertical band of
 * the frame (0..1, e.g. [0, 0.55] = upper part, clear of the text zone). Impossible -> contain.
 * Faces without a box: centre-top (never crops off the top of a head).
 */
export function placeImage(
  img: { width: number; height: number; hasFace: boolean; faceBox: Box | null; focal: { x: number; y: number } },
  frameW: number,
  frameH: number,
  faceZone: [number, number] = [0, 1],
): Placement {
  const s = Math.max(frameW / img.width, frameH / img.height);
  const vw = frameW / s / img.width; // normalised visible width
  const vh = frameH / s / img.height;
  const contain: Placement = { fit: "contain", position: "50% 50%", window: { x: 0, y: 0, width: 1, height: 1 } };
  let x0 = clamp(img.focal.x - vw / 2, 0, 1 - vw);
  let y0 = clamp(img.focal.y - vh / 2, 0, 1 - vh);
  if (img.hasFace && !img.faceBox) {
    x0 = clamp(0.5 - vw / 2, 0, 1 - vw);
    y0 = 0;
  } else if (img.faceBox) {
    const f = img.faceBox;
    const bandTop = vh * faceZone[0];
    const bandH = vh * (faceZone[1] - faceZone[0]);
    if (f.width > vw + 1e-9 || f.height > bandH + 1e-9) return contain;
    x0 = clamp(f.x + f.width / 2 - vw / 2, f.x + f.width - vw, f.x);
    // face must lie within [y0 + bandTop, y0 + bandTop + bandH]
    y0 = clamp(f.y + f.height / 2 - bandTop - bandH / 2, f.y + f.height - bandTop - bandH, f.y - bandTop);
    x0 = clamp(x0, 0, 1 - vw);
    y0 = clamp(y0, 0, 1 - vh);
    if (f.x < x0 - 1e-9 || f.x + f.width > x0 + vw + 1e-9 || f.y < y0 + bandTop - 1e-9 || f.y + f.height > y0 + bandTop + bandH + 1e-9) return contain;
  }
  const px = 1 - vw > 1e-6 ? (x0 / (1 - vw)) * 100 : 50;
  const py = 1 - vh > 1e-6 ? (y0 / (1 - vh)) * 100 : 50;
  return { fit: "cover", position: `${px.toFixed(1)}% ${py.toFixed(1)}%`, window: { x: x0, y: y0, width: vw, height: vh } };
}

/** CSS for an <img> in a slot (faces with no safe crop are contained, never cut). */
export function placeStyle(img: ImageMeta, frameW: number, frameH: number, faceZone?: [number, number]): string {
  const p = placeImage(img, frameW, frameH, faceZone);
  return `object-fit:${p.fit};object-position:${p.position}`;
}

const MIME: Record<string, string> = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml" };

/** Read + analyse a real asset. Large images are downscaled for embedding (max 2400px). */
export async function loadImageMeta(a: BrandAsset & { faceBox?: Box }): Promise<ImageMeta | null> {
  try {
    const src = sharp(a.path, { failOn: "none" }).rotate();
    const meta = await src.metadata();
    const width = meta.autoOrient?.width ?? meta.width ?? a.width;
    const height = meta.autoOrient?.height ?? meta.height ?? a.height;
    if (!width || !height) return null;
    const alphaMin = meta.hasAlpha ? (await sharp(a.path).ensureAlpha().extractChannel(3).stats()).channels[0]?.min ?? 255 : 255;
    const alpha = alphaMin < 250;
    const { data, info } = await sharp(a.path).rotate().resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    const lum = new Float64Array(n);
    let lsum = 0;
    for (let i = 0; i < n; i++) {
      const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      lum[i] = 0.2126 * lin(data[i * 3] ?? 0) + 0.7152 * lin(data[i * 3 + 1] ?? 0) + 0.0722 * lin(data[i * 3 + 2] ?? 0);
      lsum += lum[i] ?? 0;
    }
    // Saliency: gradient energy, centre-biased; centroid = focal point.
    let wx = 0, wy = 0, wsum = 0;
    for (let y = 1; y < info.height - 1; y++) for (let x = 1; x < info.width - 1; x++) {
      const i = y * info.width + x;
      const g = Math.abs((lum[i + 1] ?? 0) - (lum[i - 1] ?? 0)) + Math.abs((lum[i + info.width] ?? 0) - (lum[i - info.width] ?? 0));
      const cx = x / info.width - 0.5, cy = y / info.height - 0.5;
      const w = g * (1 - Math.min(1, (cx * cx + cy * cy) * 1.6));
      wx += w * (x / info.width); wy += w * (y / info.height); wsum += w;
    }
    const stats = await imageTextStats(a.path);
    const texty = looksTexty({ width, height, sourceUrl: a.sourceUrl, key: a.key }, stats);
    const flat = stats.top2 >= 0.88 || (stats.strong < 0.003 && stats.flat >= 0.9 && stats.top2 >= 0.6);
    const focal = wsum > 0 ? { x: wx / wsum, y: wy / wsum } : { x: 0.5, y: 0.5 };
    const big = Math.max(width, height) > 2400;
    const buf = big ? await sharp(a.path).rotate().resize(2400, 2400, { fit: "inside" }).toFormat(alpha ? "png" : "jpeg", { quality: 90 }).toBuffer() : await sharp(a.path).rotate().toBuffer();
    const fmt = big ? (alpha ? "png" : "jpeg") : (meta.format ?? "png");
    return {
      key: a.key, path: a.path, uri: `data:${MIME[fmt] ?? "image/png"};base64,${buf.toString("base64")}`,
      kind: a.kind, width, height, hasFace: a.hasFace, faceBox: a.faceBox ?? null, alpha, focal, luminance: lsum / n, sourceUrl: a.sourceUrl, texty, flat,
    };
  } catch {
    return null;
  }
}

export interface TextStats { strong: number; flat: number; top2: number }

/** Edge/flatness stats at 320px: strong = share of sharp horizontal steps, flat = near-zero steps, top2 = share of the 2 biggest grey buckets. */
export async function imageTextStats(path: string): Promise<TextStats> {
  const { data, info } = await sharp(path).resize(320, 320, { fit: "inside" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  let strong = 0, flat = 0;
  const hist = new Array<number>(16).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = data[y * w + x] ?? 0;
    hist[v >> 4] = (hist[v >> 4] ?? 0) + 1;
    if (x === 0) continue;
    const d = Math.abs(v - (data[y * w + x - 1] ?? 0));
    if (d > 70) strong++;
    if (d < 3) flat++;
  }
  const n = w * h;
  const top2 = [...hist].sort((p, q) => q - p).slice(0, 2).reduce((p, q) => p + q, 0) / n;
  return { strong: strong / n, flat: flat / n, top2 };
}

/**
 * Baked-in text heuristic: banner/og graphics (wide aspect or og/banner file names), or
 * "designed graphic" statistics: flat background with crisp glyph edges.
 */
export function looksTexty(a: { width: number; height: number; sourceUrl: string; key: string }, s: TextStats | null): boolean {
  const name = `${a.sourceUrl} ${a.key}`.toLowerCase();
  if (a.width / a.height >= 1.8) return true;
  if (/(^|[\/_.-])og([-_.]|image)|open-?graph|social|banner|share-?image|twitter-?card/.test(name)) return true;
  return !!s && s.strong >= 0.02 && s.flat >= 0.75;
}

/** Face assets without a face box are only used where they can't be cut (split/contain/card). */
export function fullBleedSafe(a: { hasFace: boolean; faceBox?: Box | null }): boolean {
  return !a.hasFace || !!a.faceBox;
}

export function findBeforeAfter<T extends { key: string; sourceUrl: string }>(assets: T[]): [T, T] | null {
  // Pair by file name: "...-1-Before_1.jpg" <-> "...-1-After_1.jpg" (source URL first, then key).
  const names = (x: T) => [x.sourceUrl.split(/[?#]/)[0]?.split("/").pop() ?? "", x.key.split("/").pop() ?? ""].map((n) => n.toLowerCase());
  for (const b of assets) {
    for (const [i, n] of names(b).entries()) {
      if (!/before/.test(n)) continue;
      const want = n.replace(/before/g, "after");
      const after = assets.find((x) => x !== b && names(x)[i] === want);
      if (after) return [b, after];
    }
  }
  return null;
}

/** Image-led templates this brand's real assets can support (planner hint). */
export function imageLayoutsFor(brand: BrandKit): string[] {
  const photos = brand.assets.filter((a) => PHOTO_KINDS.includes(a.kind) && Math.max(a.width, a.height) >= 400 && !looksTexty(a, null));
  const bleed = photos.filter((a) => fullBleedSafe(a) && !isLowRes(a, 1080, 1080));
  const out: ImageTemplateId[] = [];
  if (bleed.length) out.push("photo_fullbleed", "photo_caption");
  if (photos.length) out.push("photo_split");
  if (brand.assets.some((a) => a.kind === "product" && Math.max(a.width, a.height) >= 400)) out.push("product_spotlight");
  if (photos.filter((a) => fullBleedSafe(a)).length >= 2) out.push("photo_collage");
  if (brand.assets.some((a) => a.kind === "screenshot" && a.width >= 600)) out.push("screenshot_device");
  if (findBeforeAfter(photos)) out.push("photo_before_after");
  return IMAGE_TEMPLATE_IDS.filter((id) => out.includes(id));
}

/** Trim flat page margins (screenshots/products) so the content fills the frame. Faces are never touched. */
export async function trimmedDataUri(path: string): Promise<string | null> {
  try {
    const trimmed = await sharp(path, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).trim({ threshold: 18 }).png().toBuffer();
    const box = await detailBox(trimmed);
    const { data, info } = await sharp(trimmed).extract(box).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    return info.width >= 200 && info.height >= 120 ? `data:image/jpeg;base64,${data.toString("base64")}` : null;
  } catch {
    return null;
  }
}

/** Saliency crop: rows/cols holding the central 92% of edge energy (drops gradient/flat margins), padded 4%. */
export async function detailBox(buf: Buffer): Promise<{ left: number; top: number; width: number; height: number }> {
  const meta = await sharp(buf).metadata();
  const W = meta.width ?? 1, Hh = meta.height ?? 1;
  const { data, info } = await sharp(buf).resize(200, 200, { fit: "inside" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const col = new Float64Array(w), row = new Float64Array(h);
  for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) {
    const v = data[y * w + x] ?? 0;
    const g = Math.abs(v - (data[y * w + x - 1] ?? 0)) + Math.abs(v - (data[(y - 1) * w + x] ?? 0));
    const e = g > 24 ? g : 0; // ignore soft gradients
    col[x] = (col[x] ?? 0) + e; row[y] = (row[y] ?? 0) + e;
  }
  const span = (a: Float64Array): [number, number] => {
    const total = a.reduce((s, v) => s + v, 0);
    if (total <= 0) return [0, a.length];
    let acc = 0, lo = 0, hi = a.length;
    for (let i = 0; i < a.length; i++) { acc += a[i] ?? 0; if (acc >= total * 0.04) { lo = i; break; } }
    acc = 0;
    for (let i = a.length - 1; i >= 0; i--) { acc += a[i] ?? 0; if (acc >= total * 0.04) { hi = i + 1; break; } }
    return [lo, hi];
  };
  const [x0, x1] = span(col), [y0, y1] = span(row);
  const sx = W / w, sy = Hh / h, px = W * 0.04, py = Hh * 0.04;
  const left = Math.max(0, Math.floor(x0 * sx - px)), top = Math.max(0, Math.floor(y0 * sy - py));
  const right = Math.min(W, Math.ceil(x1 * sx + px)), bottom = Math.min(Hh, Math.ceil(y1 * sy + py));
  // Keep at least half of each side so the crop never becomes a sliver.
  if (right - left < W * 0.5 || bottom - top < Hh * 0.4) return { left: 0, top: 0, width: W, height: Hh };
  return { left, top, width: right - left, height: bottom - top };
}

/** Row band [top, bottom) of a tall image to show at `aspect` (w/h): most detailed window, top-biased, snapped to whitespace rows. */
export function pickRegion(rowEnergy: Float64Array, widthPx: number, aspect: number): [number, number] {
  const h = rowEnergy.length;
  const win = Math.min(h, Math.round(widthPx / aspect));
  if (win >= h) return [0, h];
  const pre = new Float64Array(h + 1);
  for (let i = 0; i < h; i++) pre[i + 1] = (pre[i] ?? 0) + (rowEnergy[i] ?? 0);
  const step = Math.max(1, Math.round(h / 200));
  let best = 0, bestScore = -1;
  for (let t = 0; t + win <= h; t += step) {
    const e = (pre[t + win] ?? 0) - (pre[t] ?? 0);
    const score = e * (1 - 0.35 * (t / (h - win))); // prefer the top (headline/hero of the page)
    if (score > bestScore) { bestScore = score; best = t; }
  }
  // Snap both edges into a whitespace gap, moving inward only (never cut a text line).
  // Gap = within 10% of the quietest row in the search window; the closest such row to the edge wins.
  const snap = (from: number, to: number): number => {
    const dir = to >= from ? 1 : -1;
    let min = Infinity;
    for (let r = from; r !== to; r += dir) min = Math.min(min, rowEnergy[r] ?? 0);
    for (let r = from; r !== to; r += dir) if ((rowEnergy[r] ?? 0) <= min * 1.1 + 1e-6) return r;
    return from;
  };
  const top = best === 0 ? 0 : snap(best, Math.min(h - 1, best + Math.round(win * 0.15)));
  const end = Math.min(h, best + win);
  const bottom = end >= h ? h : snap(end, Math.max(top + 1, end - Math.round(win * 0.3)));
  return [top, Math.max(top + 1, bottom)];
}

/** Clean region crop for strips: tall screenshots cut to a band at `aspect`; others unchanged (null). */
export async function regionDataUri(path: string, aspect: number): Promise<{ uri: string; aspect: number } | null> {
  try {
    const base = sharp(path, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
    const m = await base.clone().png().toBuffer({ resolveWithObject: true });
    const W = m.info.width, Hh = m.info.height;
    if (W / Hh >= aspect * 0.9) return null;
    const { data, info } = await sharp(m.data).greyscale().raw().toBuffer({ resolveWithObject: true });
    const rows = new Float64Array(info.height);
    for (let y = 0; y < info.height; y++) {
      let e = 0;
      for (let x = 1; x < info.width; x++) e += Math.abs((data[y * info.width + x] ?? 0) - (data[y * info.width + x - 1] ?? 0));
      rows[y] = e;
    }
    const [top, bottom] = pickRegion(rows, W, aspect);
    const out = await sharp(m.data).extract({ left: 0, top, width: W, height: bottom - top }).jpeg({ quality: 90 }).toBuffer();
    // Real aspect after whitespace snapping (the page sizes the frame from it, so no distortion).
    return { uri: `data:image/jpeg;base64,${out.toString("base64")}`, aspect: Math.round((W / (bottom - top)) * 1000) / 1000 };
  } catch {
    return null;
  }
}

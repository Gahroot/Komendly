// Image analysis for the creative scorer (sharp). Cheap proxies computed on tiny downscaled copies; they flag
// likely problems, they do not read the text itself (the vision critique does that on a sample).
import sharp from "sharp";
import type { ImageMetrics } from "../../../src/lib/product-intel/creative";

const at = (b: Uint8Array, i: number) => b[i] ?? 0;
const hexRgb = (h: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const h6 = m?.[1];
  return h6 ? [parseInt(h6.slice(0, 2), 16), parseInt(h6.slice(2, 4), 16), parseInt(h6.slice(4, 6), 16)] : null;
};

export async function imageMetrics(buf: Buffer, brandHex: string[]): Promise<ImageMetrics> {
  const meta = await sharp(buf).metadata();
  const grey = async (n: number) => (await sharp(buf).flatten({ background: "#fff" }).resize(n, n, { fit: "fill" }).greyscale().raw().toBuffer());
  const g64 = await grey(64);
  const sorted = Uint8Array.from(g64).sort();
  const p = (q: number) => at(sorted, Math.min(sorted.length - 1, Math.floor(q * sorted.length)));
  const mean = g64.reduce((s, v) => s + v, 0) / g64.length;
  const lumaStd = Math.sqrt(g64.reduce((s, v) => s + (v - mean) ** 2, 0) / g64.length);
  const g8 = await grey(8);
  const avg8 = g8.reduce((s, v) => s + v, 0) / g8.length;
  let bits = "";
  for (let i = 0; i < 64; i++) bits += at(g8, i) >= avg8 ? "1" : "0";
  const hash = Array.from({ length: 16 }, (_, i) => parseInt(bits.slice(i * 4, i * 4 + 4), 2).toString(16)).join("");
  const N = 128, band = 8;
  const g = await grey(N);
  let strong = 0, total = 0;
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    if (x >= band && x < N - band && y >= band && y < N - band) continue;
    total++;
    if (Math.abs(at(g, y * N + x + 1) - at(g, y * N + x - 1)) + Math.abs(at(g, (y + 1) * N + x) - at(g, (y - 1) * N + x)) > 90) strong++;
  }
  const brand = brandHex.map(hexRgb).filter((c): c is [number, number, number] => !!c);
  let brandColorShare: number | null = null;
  if (brand.length) {
    const rgb = await sharp(buf).flatten({ background: "#fff" }).resize(48, 48, { fit: "fill" }).removeAlpha().raw().toBuffer();
    let near = 0;
    for (let i = 0; i < rgb.length; i += 3) if (brand.some(([r, gg, b]) => Math.hypot(at(rgb, i) - r, at(rgb, i + 1) - gg, at(rgb, i + 2) - b) < 60)) near++;
    brandColorShare = near / (rgb.length / 3);
  }
  return { width: meta.width ?? 0, height: meta.height ?? 0, lumaRange: p(0.95) - p(0.05), lumaStd, marginInk: total ? strong / total : 0, brandColorShare, hash };
}

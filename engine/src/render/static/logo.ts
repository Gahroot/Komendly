// Logo analysis in Node (sharp rasterises SVG/PNG/JPEG/WebP): legibility per background
// and the logo's vivid brand hue. The logo itself is never recoloured.
import sharp from "sharp";
import { contrastRatio } from "./color";

export interface LogoInfo {
  /** No transparent pixels: the mark is a self-contained tile. */
  opaque?: boolean;
  /** Square favicon-style mark under 64px: shown as a tile + brand name. */
  tiny?: boolean;
  /** Opaque pixel colours (downsampled), for contrast checks against any background. */
  samples: string[];
  /** Most common saturated colour in the logo, if any (e.g. Plausible's indigo mark). */
  vivid: string | null;
  /** Trimmed (no empty margins) PNG data URI of the logo, and its aspect (w/h). */
  uri?: string;
  aspect?: number;
}

/** Rendered logo height for a requested height: wordmarks >= 160px wide, marks >= 96px tall, <= 420px wide. */
export function logoHeight(requested: number, aspect: number | undefined): number {
  const a = aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const minH = a >= 1.6 ? Math.ceil(160 / a) : 96;
  return Math.max(minH, Math.min(requested, Math.floor(420 / a)));
}

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export async function analyzeLogo(path: string): Promise<LogoInfo | null> {
  try {
    const { data, info } = await sharp(path, { density: 144 })
      .resize(160, 160, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const samples: string[] = [];
    let transparent = 0;
    const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i < info.width * info.height * 4; i += 4) {
      const r = data[i] ?? 0, g = data[i + 1] ?? 0, b = data[i + 2] ?? 0, a = data[i + 3] ?? 0;
      if (a < 250) transparent++;
      if (a < 160) continue;
      samples.push(hex(r, g, b));
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      // Vivid = saturated and bright enough to act as an accent (skips navy wordmark ink).
      if (max < 110 || (max - min) / max < 0.35) continue;
      const k = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += r; e.g += g; e.b += b;
      buckets.set(k, e);
    }
    if (!samples.length) return null;
    const top = [...buckets.entries()].sort((x, y) => y[1].n - x[1].n || (x[0] < y[0] ? -1 : 1))[0]?.[1];
    const vivid = top && top.n >= samples.length * 0.05 ? hex(Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n)) : null;
    let uri: string | undefined;
    let aspect: number | undefined;
    try {
      // Trim transparent / uniform margins so chips hug the mark (no wide empty bars).
      const t = await sharp(path, { density: 288 }).ensureAlpha().trim({ threshold: 12 }).png().toBuffer({ resolveWithObject: true });
      uri = `data:image/png;base64,${t.data.toString("base64")}`;
      aspect = t.info.width / t.info.height;
    } catch { /* keep original */ }
    // Fully opaque logo (e.g. favicon tile) carries its own background: it reads on anything.
    const opaque = transparent === 0;
    const m = await sharp(path).metadata();
    const tiny = (m.width ?? 999) < 64 && (m.height ?? 999) < 64 && Math.abs((m.width ?? 1) / (m.height ?? 1) - 1) < 0.15;
    return { samples, vivid, uri, aspect, opaque, tiny };
  } catch {
    return null;
  }
}

/** Share of the logo's opaque pixels that reach `min` contrast on `bg`. */
export function logoLegibility(info: LogoInfo, bg: string, min = 3): number {
  let ok = 0;
  for (const s of info.samples) if (contrastRatio(s, bg) >= min) ok++;
  return ok / info.samples.length;
}

/** True when most of the logo (≥ 60% of its ink) reads at 3:1 on `bg`. */
export function logoReadsOn(info: LogoInfo | null, bg: string): boolean {
  return info ? info.opaque === true || logoLegibility(info, bg) >= 0.6 : true;
}

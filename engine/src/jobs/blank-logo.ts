// Detects placeholder logos: an empty app-icon plate or a nearly blank image (e.g. pkservices.business's
// /icons/icon-192.png: a dark rounded square with one short line). Rendering those as "the logo" makes every ad
// fail QC (logo_present), so the brand kit drops them and renderers fall back to the brand-name wordmark.
import sharp from "sharp";

export type LogoInk = { ink: number; plate: number };

/** Share of "ink" pixels (differ from the dominant background, transparent counts as background) in the inner 76% box,
 *  and the share of the whole image covered by the single dominant opaque colour (a solid plate). */
export async function logoInk(path: string): Promise<LogoInk | null> {
  try {
    const vector = /\.svg$/i.test(path);
    const N = 128;
    const { data } = await sharp(path, { density: vector ? 200 : 72 })
      .resize(N, N, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const q = (i: number) => ((data[i] ?? 0) >> 4) * 256 + ((data[i + 1] ?? 0) >> 4) * 16 + ((data[i + 2] ?? 0) >> 4);
    const counts = new Map<number, number>();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) < 128) continue;
      opaque++;
      const k = q(i);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    if (opaque === 0) return { ink: 0, plate: 0 };
    let dom = -1;
    let domN = 0;
    for (const [k, n] of counts) if (n > domN) [dom, domN] = [k, n];
    const total = N * N;
    const plate = domN / total;
    // Background = transparent when most pixels are transparent, else the dominant opaque colour.
    const bgIsTransparent = opaque < total / 2;
    const near = (i: number) => {
      const k = q(i);
      const dr = Math.abs((k >> 8) - (dom >> 8));
      const dg = Math.abs(((k >> 4) & 15) - ((dom >> 4) & 15));
      const db = Math.abs((k & 15) - (dom & 15));
      return dr + dg + db <= 2;
    };
    const lo = Math.round(N * 0.12);
    const hi = N - lo;
    let ink = 0;
    for (let y = lo; y < hi; y++)
      for (let x = lo; x < hi; x++) {
        const i = (y * N + x) * 4;
        const a = data[i + 3] ?? 0;
        if (bgIsTransparent ? a >= 128 : a >= 128 && !near(i)) ink++;
      }
    return { ink: ink / ((hi - lo) * (hi - lo)), plate };
  } catch {
    return null;
  }
}

/** Placeholder: almost nothing drawn, or a solid plate with only a sliver of mark on it. */
export function isBlankLogo(m: LogoInk | null): boolean {
  if (!m) return false;
  if (m.ink < 0.015) return true;
  return m.plate > 0.6 && m.ink < 0.05;
}

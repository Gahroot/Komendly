// Chooses what to overlay as the logo: the real file when it is crisp enough (never upscaled),
// otherwise a wordmark of the brand name in the heading font.
import sharp from "sharp";

export const MIN_LOGO_PX = 160;
/** Wide lockups (aspect >= 2) may be upscaled this much; they read fine where a square favicon blurs. */
export const LOCKUP_MAX_UPSCALE = 2;

/** Usable when wide enough (>= 300px), big enough (>= 160x160 area), or a wide lockup >= 120px. Never a square favicon. */
export function usableLogo(w: number, h: number, path = ""): { ok: boolean; maxW: number } {
  if (isFavicon(path) || w <= 0 || h <= 0) return { ok: false, maxW: 0 };
  const aspect = w / h;
  if (w >= 300 || w * h >= MIN_LOGO_PX * MIN_LOGO_PX) return { ok: true, maxW: w };
  if (aspect >= 2 && w >= 120) return { ok: true, maxW: w * LOCKUP_MAX_UPSCALE };
  return { ok: false, maxW: 0 };
}

/** Short brand name for a wordmark: the words matching the domain stem, else the first two words; no tagline. */
export function shortBrandName(name: string, domain = ""): string {
  const head = (name.split(/\s+[|·–—:-]\s+|\s*[|·]\s*/)[0] ?? name).trim();
  const words = head.split(/\s+/).filter(Boolean);
  const stem = domain.replace(/^www\./, "").split(".")[0]?.toLowerCase() ?? "";
  let acc = "";
  for (let i = 0; i < words.length && stem; i++) {
    acc += (words[i] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (acc === stem) return words.slice(0, i + 1).join(" ");
    if (!stem.startsWith(acc)) break;
  }
  // Keep the full name when it is short (e.g. "Greater Boston HVAC"); trim only long descriptive names.
  if (words.length <= 4 && head.length <= 28) return words.join(" ");
  return words.slice(0, Math.min(2, words.length)).join(" ");
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export function isFavicon(path: string): boolean {
  return /favicon|apple-touch|\.ico$/i.test(path);
}

/** Wordmark PNG (transparent), width ~ targetW. */
export async function wordmark(name: string, font: string | undefined, targetW: number, colour: string): Promise<Buffer> {
  const size = 96;
  const w = Math.max(200, Math.round(name.length * size * 0.62));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round(size * 1.3)}"><text x="0" y="${size}" font-family="${esc(font ?? "")}, Helvetica, Arial, sans-serif" font-weight="700" font-size="${size}" fill="${colour}">${esc(name)}</text></svg>`;
  const png = await sharp(Buffer.from(svg)).trim().png().toBuffer();
  return sharp(png).resize({ width: targetW }).png().toBuffer();
}

/** Real logo trimmed, or null when it is a favicon / too small to show crisply. Vector files always qualify. */
export async function crispLogo(path: string | null): Promise<{ png: Buffer; nativeW: number; vector: boolean } | null> {
  if (!path || isFavicon(path)) return null;
  const vector = /\.svg$/i.test(path);
  try {
    const png = await sharp(path, { density: vector ? 400 : 72 }).trim().png().toBuffer();
    const m = await sharp(png).metadata();
    if (vector) return { png, nativeW: Number.POSITIVE_INFINITY, vector };
    const u = usableLogo(m.width ?? 0, m.height ?? 0, path);
    return u.ok ? { png, nativeW: u.maxW, vector } : null;
  } catch {
    return null;
  }
}

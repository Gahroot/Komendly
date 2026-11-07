// Brand color helpers: parse, contrast, pick readable pairs from the BrandKit only.

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function normHex(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}` : null;
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Near-black or white, whichever reads better on `bg`. */
export function inkOn(bg: string): string {
  return contrast(bg, "#ffffff") >= contrast(bg, "#0e0f12") ? "#ffffff" : "#0e0f12";
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0];
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface Palette {
  bg: string;
  ink: string;
  accent: string;
  accentInk: string;
  surface: string;
}

/**
 * Background, text and accent from brand colors. A preferred bg/accent (LLM plan) is used
 * when it is a brand color with enough contrast; otherwise the most suitable brand color.
 */
export function buildPalette(colors: Array<{ hex: string; role: string }>, prefer?: { bg?: string; accent?: string }): Palette {
  const brand = colors.map((c) => ({ hex: normHex(c.hex), role: c.role.toLowerCase() })).filter((c): c is { hex: string; role: string } => c.hex !== null);
  const hexes = [...new Set(brand.map((c) => c.hex))];
  const byRole = (re: RegExp) => brand.find((c) => re.test(c.role))?.hex;
  const preferBg = prefer?.bg ? normHex(prefer.bg) : null;
  const bg =
    (preferBg && hexes.includes(preferBg) ? preferBg : undefined) ??
    byRole(/background|bg|base|dark/) ??
    [...hexes].sort((a, b) => luminance(a) - luminance(b))[0] ??
    "#0e0f12";
  const ink = inkOn(bg);
  const others = hexes.filter((h) => h !== bg);
  const preferAccent = prefer?.accent ? normHex(prefer.accent) : null;
  const accentOk = (h: string) => contrast(h, bg) >= 2.2;
  const accent =
    (preferAccent && others.includes(preferAccent) && accentOk(preferAccent) ? preferAccent : undefined) ??
    [byRole(/primary|accent|brand|cta|button/)].find((h): h is string => !!h && h !== bg && accentOk(h)) ??
    [...others].sort((a, b) => contrast(b, bg) - contrast(a, bg)).find(accentOk) ??
    ink;
  const surface = luminance(bg) < 0.4 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  return { bg, ink, accent, accentInk: inkOn(accent), surface };
}

/** HSL saturation 0-1. */
export function saturation(hex: string): number {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
}

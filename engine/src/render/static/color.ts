// Colour maths + palette selection with WCAG AA contrast guarantees.
import type { BrandKit } from "./types";

export const NEUTRAL_LIGHT = "#FFFFFF";
export const NEUTRAL_DARK = "#0E0F13";
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

export function normalizeHex(input: string): string | null {
  const m = input.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (!m || !m[1]) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toUpperCase()}`;
}

function channels(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? NEUTRAL_DARK;
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function isDark(hex: string): boolean {
  return luminance(hex) < 0.18;
}

/** Mix two colours (t=0 -> a, t=1 -> b). */
export function mix(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return `#${ca.map((v, i) => Math.round(v + ((cb[i] ?? 0) - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function saturation(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/**
 * Pick the text colour for `background`: first candidate (brand order) that meets
 * `min` contrast, else the neutral with the best contrast.
 */
export function pickTextColor(background: string, candidates: string[], min = AA_TEXT): string {
  for (const c of candidates) {
    const n = normalizeHex(c);
    if (n && contrastRatio(n, background) >= min) return n;
  }
  return contrastRatio(NEUTRAL_LIGHT, background) >= contrastRatio(NEUTRAL_DARK, background) ? NEUTRAL_LIGHT : NEUTRAL_DARK;
}

export interface Palette {
  bg: string;
  text: string;
  muted: string; // secondary text on bg (still AA)
  surface: string; // card colour on bg
  surfaceText: string;
  accent: string; // brand primary
  accentText: string; // text on accent
  accentOnBg: string; // accent usable as text/marks on bg (AA large)
  dark: boolean;
}

function byRole(colors: BrandKit["colors"], re: RegExp): string | null {
  for (const c of colors) if (re.test(c.role)) { const n = normalizeHex(c.hex); if (n) return n; }
  return null;
}

/** Build a contrast-safe palette from brand colours (neutral fallback). */
/** Brand accent: a vivid brand colour (role primary/accent first, then most saturated), else the logo's vivid hue, else primary. */
function pickAccent(colors: BrandKit["colors"], all: string[], logoVivid: string | null): string | null {
  const vivid = (h: string | null) => !!h && saturation(h) >= 0.3 && luminance(h) > 0.02 && luminance(h) < 0.85;
  const role = byRole(colors, /primary|brand|accent|cta|button/i);
  if (vivid(role)) return role;
  const sat = [...all].sort((a, b) => saturation(b) - saturation(a))[0] ?? null;
  if (vivid(sat)) return sat;
  if (logoVivid && vivid(normalizeHex(logoVivid))) return normalizeHex(logoVivid);
  return role ?? sat;
}

export function buildPalette(colors: BrandKit["colors"], logoVivid: string | null = null): Palette {
  const all = colors.map((c) => normalizeHex(c.hex)).filter((h): h is string => h !== null);
  const accent = pickAccent(colors, all, logoVivid) ?? "#2F5BFF";
  const bg = byRole(colors, /background|^bg|surface|base/i) ?? NEUTRAL_LIGHT;
  const dark = isDark(bg);
  const textCandidates = [byRole(colors, /text|foreground|ink|heading/i), ...all].filter((h): h is string => !!h && h !== bg);
  const text = pickTextColor(bg, textCandidates);
  const muted = contrastRatio(mix(text, bg, 0.3), bg) >= AA_TEXT ? mix(text, bg, 0.3) : text;
  const surface = dark ? mix(bg, NEUTRAL_LIGHT, 0.08) : mix(bg, NEUTRAL_DARK, bg === NEUTRAL_LIGHT ? 0.04 : 0.06);
  const surfaceText = pickTextColor(surface, [text, ...all]);
  const accentText = pickTextColor(accent, [bg, NEUTRAL_LIGHT, NEUTRAL_DARK]);
  const accentOnBg = contrastRatio(accent, bg) >= AA_LARGE ? accent : text;
  return { bg, text, muted, surface, surfaceText, accent, accentText, accentOnBg, dark };
}

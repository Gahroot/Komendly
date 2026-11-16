// Brand bridge: the customer's brand colours/fonts -> the motion library's look tokens
// (--field, --ink, --accent, ... on .look-brand), written to ./brand/look.css + ./brand/look.json
// so `node kit/bin/library.mjs look . brand` installs it and every library piece comes out on-brand.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { VENDOR_DIR } from "../modules/ezmotion/fonts";

export interface BrandInput {
  colors: Array<{ hex: string; role?: string }>;
  fonts: Array<{ family: string; role?: string }>;
}

export interface BrandLook {
  tokens: Record<string, string>;
  /** Bundled families to install (brand fonts we ship + the fallbacks in the stacks). */
  fonts: string[];
}

type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

export function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

export function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i as 0] + (b[i as 0] - a[i as 0]) * t) as Rgb;
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/** Smallest step of `c` toward black or white (away from `bg`) that reaches `min` contrast on `bg`. */
export function ensureContrast(c: Rgb, bg: Rgb, min: number): Rgb {
  if (contrast(c, bg) >= min) return c;
  const target = luminance(bg) > 0.18 ? BLACK : WHITE;
  for (let t = 0.05; t < 1; t += 0.05) {
    const next = mix(c, target, t);
    if (contrast(next, bg) >= min) return next;
  }
  return target;
}

const pick = <T extends { role?: string }>(xs: T[], re: RegExp): T | undefined => xs.find((x) => re.test((x.role ?? "").toLowerCase()));

const GENERIC = /^(serif|sans-serif|monospace|system-ui|cursive|inherit|initial)$/i;
const DISPLAY_FALLBACK = "Bricolage Grotesque";
const TEXT_FALLBACK = "Host Grotesk";
const MONO = "Martian Mono";

/** Pure: brand colours/fonts -> look tokens with --ink and --muted >= 4.5:1 on --field (ink aims for 7:1). */
export function brandLook(brand: BrandInput, bundled: readonly string[] = []): BrandLook {
  const colors = brand.colors.flatMap((c) => {
    const rgb = parseHex(c.hex);
    return rgb ? [{ rgb, role: c.role }] : [];
  });
  const primary = pick(colors, /primary|brand|main/)?.rgb ?? colors.find((c) => !/background|bg|surface|text|ink/.test((c.role ?? "").toLowerCase()))?.rgb ?? [37, 99, 235];
  const bgRole = pick(colors, /background|bg|surface/)?.rgb;
  // No background colour: a deep tint of the primary keeps the field on-brand.
  const field = bgRole ?? mix(primary, [8, 8, 12], 0.88);
  const dark = luminance(field) < 0.18;
  const accentRaw = pick(colors, /accent|highlight|cta|secondary/)?.rgb ?? primary;
  const accent = ensureContrast(accentRaw, field, 3);
  const inkRaw = pick(colors, /text|ink|foreground|body/)?.rgb ?? mix(dark ? WHITE : BLACK, primary, 0.06);
  // A brand text colour that already passes is kept; otherwise aim for 7:1.
  const ink = contrast(inkRaw, field) >= 4.5 ? inkRaw : ensureContrast(inkRaw, field, 7);
  const muted = ensureContrast(mix(ink, field, 0.38), field, 4.5);
  const field2 = mix(field, dark ? WHITE : BLACK, 0.07);
  const line = mix(field, ink, 0.16);
  // For ./kit/punch.js: a second brand colour (glows, confetti) and a light surface for product cards.
  const second = colors.find((c) => !/background|bg|surface|text|ink|foreground|body/.test((c.role ?? "").toLowerCase()) && toHex(c.rgb) !== toHex(accentRaw) && toHex(c.rgb) !== toHex(primary))?.rgb;
  const accent2 = second ?? (toHex(accentRaw) !== toHex(primary) ? primary : mix(accent, dark ? WHITE : BLACK, 0.35));
  const paper = mix(WHITE, primary, 0.05);

  const fonts = brand.fonts.filter((f) => f.family.trim() && !GENERIC.test(f.family.trim()));
  const display = (pick(fonts, /head|display|title/) ?? fonts[0])?.family.trim();
  const text = (pick(fonts, /body|text|paragraph/) ?? pick(fonts, /head|display|title/) ?? fonts[0])?.family.trim();
  const isBundled = (f?: string) => (f ? bundled.find((b) => b.toLowerCase() === f.toLowerCase()) : undefined);
  const stack = (f: string | undefined, fallback: string, generic: string) => [f && f.toLowerCase() !== fallback.toLowerCase() ? f : null, fallback].filter(Boolean).map((x) => `"${String(x).replace(/["\\]/g, "")}"`).concat(generic).join(", ");
  const installs = [isBundled(display) ?? DISPLAY_FALLBACK, isBundled(text) ?? TEXT_FALLBACK, MONO, "Fraunces"];

  return {
    tokens: {
      "--field": toHex(field),
      "--field-2": toHex(field2),
      "--ink": toHex(ink),
      "--accent": toHex(accent),
      "--accent-2": toHex(accent2),
      "--paper": toHex(paper),
      "--muted": toHex(muted),
      "--line": toHex(line),
      "--display": stack(isBundled(display) ?? display, DISPLAY_FALLBACK, "sans-serif"),
      "--display-weight": "700",
      "--display-stretch": "100%",
      "--display-tracking": "-0.03em",
      "--text": stack(isBundled(text) ?? text, TEXT_FALLBACK, "sans-serif"),
      "--serif": `"Fraunces", serif`,
      "--mono": `"${MONO}", monospace`,
      "--radius": "20px",
    },
    fonts: [...new Set(installs)].sort(),
  };
}

/** Pure: the tokens as ./brand/look.css. */
export function brandLookCss(look: BrandLook): string {
  const body = Object.entries(look.tokens).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `/* The customer's brand as motion-library tokens. Install: node kit/bin/library.mjs look . brand */\n.look-brand {\n${body}\n}\n`;
}

/** Write ./brand/look.css + ./brand/look.json (the fonts `library.mjs look . brand` installs). */
export async function writeBrandLook(project: string, brand: BrandInput): Promise<BrandLook> {
  const manifest = JSON.parse(await readFile(join(VENDOR_DIR, "fonts", "fonts.json"), "utf8")) as Array<{ family: string }>;
  const look = brandLook(brand, manifest.map((f) => f.family));
  await mkdir(join(project, "brand"), { recursive: true });
  await writeFile(join(project, "brand", "look.css"), brandLookCss(look));
  await writeFile(join(project, "brand", "look.json"), `${JSON.stringify({ fonts: look.fonts, tokens: look.tokens }, null, 2)}\n`);
  return look;
}

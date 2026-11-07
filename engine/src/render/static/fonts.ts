// Font CSS: local brand font files -> Google Fonts -> system fallback.
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import type { BrandKit } from "./types";

const FONT_MIME: Record<string, string> = { ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" };
const SYSTEM_SANS = `"Inter", "Helvetica Neue", Helvetica, Arial, "Segoe UI", system-ui, sans-serif`;
const SYSTEM_SERIF = `Georgia, "Times New Roman", serif`;

export interface FontPlan {
  css: string; // @font-face rules / @import
  heading: string; // CSS family stack
  body: string;
  families: string[]; // brand families to wait for
}

function isSerif(family: string): boolean {
  return /serif|garamond|playfair|merriweather|lora|georgia|times|baskerville|caslon|fraunces/i.test(family) && !/sans/i.test(family);
}

function stack(family: string): string {
  return `"${family.replace(/"/g, "")}", ${isSerif(family) ? SYSTEM_SERIF : SYSTEM_SANS}`;
}

function localFontPath(src: string | undefined): string | null {
  if (!src) return null;
  const p = src.startsWith("file://") ? new URL(src).pathname : src;
  return FONT_MIME[extname(p).toLowerCase()] && existsSync(p) ? p : null;
}

export function buildFontPlan(fonts: BrandKit["fonts"], allowRemote = true): FontPlan {
  const heading = fonts.find((f) => /head|display|title/i.test(f.role)) ?? fonts[0];
  const body = fonts.find((f) => /body|text|para/i.test(f.role)) ?? fonts[1] ?? heading;
  const rules: string[] = [];
  const google: string[] = [];
  const families: string[] = [];
  for (const f of [heading, body]) {
    if (!f || families.includes(f.family)) continue;
    families.push(f.family);
    const local = localFontPath(f.sourceUrl);
    if (local) {
      const mime = FONT_MIME[extname(local).toLowerCase()] ?? "font/ttf";
      const data = readFileSync(local).toString("base64");
      rules.push(`@font-face{font-family:"${f.family}";src:url(data:${mime};base64,${data});font-weight:100 900;font-display:block;}`);
    } else if (allowRemote) {
      google.push(`family=${encodeURIComponent(f.family).replace(/%20/g, "+")}:wght@400;500;600;700;800`);
    }
  }
  const imp = google.length ? `@import url("https://fonts.googleapis.com/css2?${google.join("&")}&display=block");` : "";
  return {
    css: imp + rules.join(""),
    heading: heading ? stack(heading.family) : SYSTEM_SANS,
    body: body ? stack(body.family) : SYSTEM_SANS,
    families,
  };
}

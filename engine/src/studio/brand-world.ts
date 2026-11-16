// Brand world: the creative director designs a small design system for a brand ONCE (its signature world as layered
// CSS, type styles and UI components, in the brand's own visual language), cached per brand version and reused by every
// video for that brand. Frontier-made ads get their polish from exactly this: a designed world, not per-video improvisation.
// STUDIO_BRAND_WORLD=0 turns it off.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { AIProvider, UsageMeter } from "../providers/types";
import type { Storage } from "../storage/s3";
import { brandKey } from "../storage/keys";

export const WORLD_FONTS = ["Fraunces", "Newsreader", "Young Serif", "Gloock", "Bricolage Grotesque", "Mona Sans", "Hubot Sans", "Schibsted Grotesk", "Host Grotesk", "Funnel Display", "Sora", "Unbounded", "Archivo", "Big Shoulders", "Anybody", "Doto", "Martian Mono", "Short Stack", "Finger Paint"];

export const WORLD_SYSTEM = `You are the art director of a top motion studio. Design the reusable design system every video for this brand will be built from: its signature WORLD, its type and its UI components, in THEIR visual language (look closely at the images: the art style of their mascot or illustrations, their logo, their site). Juniors build videos (HTML + GSAP, 1080x1920, 1920x1080 or 1080x1080) by composing your classes, so make them beautiful, specific to this brand and impossible to use badly.

Reply with exactly two fenced blocks, nothing else:

\`\`\`css
/* WORLD: 2-3 lines describing the world, the type pairing and the components (the juniors read this first). */
... the stylesheet ...
\`\`\`

\`\`\`html
... a short demo composition ...
\`\`\`

The stylesheet (world.css), ratio-agnostic (size with vmin / % / clamp, never fixed px layouts):
- @font-face for the fonts you use, src: url("../kit/fonts/<file>.woff2") (files: <family-lowercase-dashed>-normal.woff2 and, for Fraunces and Newsreader, -italic.woff2). Installed families ONLY: ${WORLD_FONTS.join(", ")}. Use their brand fonts when they are in this list.
- :root tokens: --ink (stage), --paper (light surfaces and text), --accent, --accent-2, --muted, --display, --serif (accent face), --text.
- .world: a full-frame (position:absolute; inset:0) layered backdrop that IS the brand's world, with child layers .world-sky, .world-mid, .world-fg (and optional extras) drawn with gradients, CSS shapes, pseudo-elements and inline SVG data URIs (a skyline, terrain, a horizon, a pattern, light, grain: whatever their world is). It must look finished and atmospheric on its own, with depth.
- Type: .t-hero (huge, 11-16vmin, centred), .t-accent (the accent face/colour for one or two words), .t-label (small caps eyebrow, >= 2.8vmin), .t-body (>= 3.4vmin).
- Components, all big and phone-readable (text >= 3.4vmin): .card, .chip, .bubble (chat bubble, plus .bubble.me for the sender), .btn (call to action), .quote (review/testimonial card with .stars), .price (with .was strike), .check (checklist row, .check.done ticked), .frame (screenshot or device frame), .mascot (staging for a character image: ground shadow, glow), .stack (cards fanned in depth).
- No animation in CSS (GSAP owns motion): no @keyframes, no transition, no animation properties.

The demo (world.html): a 6-second 1080x1920 HyperFrames composition showing the world and every component together, linking ./world.css: <link rel="stylesheet" href="world.css">, root <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="6">, GSAP from https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js, a paused timeline registered as window.__timelines["main"] (no Math.random, timers or infinite tweens). Use real words from the brand (their offer, their voice), never lorem ipsum. Use image files only from the list you are given (paths relative to the demo: photos/<file>, ../uploads/<file>, logo files as given).`;

export interface WorldBrand { name?: string | null; url?: string | null; colors?: Array<{ hex: string; role?: string | undefined }>; fonts?: Array<{ family: string; role?: string | undefined }> }

/** Pure: the request for one brand world. */
export function worldPrompt(brand: WorldBrand, images: Array<{ path: string; caption?: string | null }>, voice?: string | null): string {
  return [
    `Brand: ${brand.name ?? "unnamed"}${brand.url ? ` (${brand.url})` : ""}.`,
    brand.colors?.length ? `Colours: ${brand.colors.map((c) => `${c.hex}${c.role ? ` (${c.role})` : ""}`).join(", ")}.` : "",
    brand.fonts?.length ? `Their fonts: ${brand.fonts.map((f) => `${f.family}${f.role ? ` (${f.role})` : ""}`).join(", ")}.` : "",
    voice ? `Voice: ${voice}` : "",
    images.length ? `Images attached, in order (paths for the demo): ${images.map((i, n) => `${n + 1}. ${i.path}${i.caption ? ` (${i.caption})` : ""}`).join("; ")}.` : "No images.",
  ].filter(Boolean).join("\n");
}

/** Pure: the css and html blocks of the reply, or null when either is missing or unusable. */
export function parseWorld(text: string): { css: string; html: string } | null {
  const css = /```css\s*\n([\s\S]*?)```/i.exec(text)?.[1]?.trim();
  const html = /```html\s*\n([\s\S]*?)```/i.exec(text)?.[1]?.trim();
  if (!css || !html || css.length < 400 || !/\.world\b/.test(css) || !/data-composition-id/.test(html)) return null;
  // GSAP owns motion: CSS animations would break seeking.
  const clean = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").replace(/^\s*(animation|transition)[^;]*;/gm, "");
  return { css: clean, html };
}

/** Pure: the summary comment at the top of world.css (for the concept writer). */
export function worldSummary(css: string): string {
  return (/\/\*\s*WORLD:([\s\S]*?)\*\//.exec(css)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/** Cached per brand version: install ./brand/world.css + world.html, designing it once when missing. Returns the
 * world summary, or null (no brand world; the turn goes on without it). Never throws. */
export async function ensureBrandWorld(o: {
  storage: Storage; provider: AIProvider; project: string; workspaceId: string; brandProfileId: string; version: string;
  brand: WorldBrand; voice?: string | null; images: Array<{ abs: string; path: string; caption?: string | null }>;
  usage: UsageMeter[]; signal?: AbortSignal; log?: (msg: string, data?: Record<string, unknown>) => void;
}): Promise<string | null> {
  if (process.env.STUDIO_BRAND_WORLD === "0") return null;
  const dir = join(o.project, "brand");
  const prefix = brandKey(o.workspaceId, o.brandProfileId, "world", o.version);
  try {
    await mkdir(dir, { recursive: true });
    const cached = await Promise.all([o.storage.get(`${prefix}/world.css`), o.storage.get(`${prefix}/world.html`)]).catch(() => null);
    if (cached) {
      await writeFile(join(dir, "world.css"), cached[0]);
      await writeFile(join(dir, "world.html"), cached[1]);
      return worldSummary(cached[0].toString("utf8"));
    }
    const images: Array<{ mediaType: string; base64: string }> = [];
    const used: typeof o.images = [];
    for (const i of o.images.slice(0, 6)) {
      const mt = MIME[extname(i.abs).toLowerCase()];
      const b = mt ? await readFile(i.abs).catch(() => null) : null;
      if (!b || b.length > 3_000_000) continue;
      images.push({ mediaType: mt as string, base64: b.toString("base64") });
      used.push(i);
    }
    const r = await o.provider.text({ system: WORLD_SYSTEM, prompt: worldPrompt(o.brand, used, o.voice), images, reasoning: "medium", ...(o.signal ? { signal: o.signal } : {}) });
    o.usage.push(r.usage);
    const w = parseWorld(r.text);
    if (!w) { o.log?.("studio brand world unusable", { chars: r.text.length }); return null; }
    await writeFile(join(dir, "world.css"), `${w.css}\n`);
    await writeFile(join(dir, "world.html"), `${w.html}\n`);
    await Promise.all([o.storage.put(`${prefix}/world.css`, Buffer.from(`${w.css}\n`), "text/css"), o.storage.put(`${prefix}/world.html`, Buffer.from(`${w.html}\n`), "text/html")]).catch((e) => o.log?.("studio brand world cache failed", { error: String(e) }));
    return worldSummary(w.css);
  } catch (e) {
    o.log?.("studio brand world failed", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

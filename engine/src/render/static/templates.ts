// HTML/CSS ad templates. Text, colours, fonts and logo are rendered by the browser
// (pixel-exact); imagery is only ever a background/supporting element.
import type { Ratio } from "../../../../src/lib/ads/contracts";
import { RATIO_PIXELS } from "../../../../src/lib/ads/contracts";
import { NEUTRAL_DARK, NEUTRAL_LIGHT, mix, pickTextColor, type Palette } from "./color";
import type { FontPlan } from "./fonts";
import { logoHeight, logoReadsOn, type LogoInfo } from "./logo";
import type { ImageMeta } from "./imagery";
import { imageBody, imageCss, isImageTemplate } from "./templates-image";
import { BODY_MIN_PX, HEADLINE_MIN_PX, safeZone, type TemplateId } from "./layout";

export interface Visual {
  uri: string;
  hasFace: boolean;
  generated: boolean;
  /** Screenshots/products are shown whole (contain); scenes may fill (cover). */
  fit: "cover" | "contain";
  /** Source width/height (when known): full-bleed only when the crop keeps most of the image. */
  aspect?: number;
  /** Clean region crops at several aspects (tall screenshots); the page picks the one that fits its box. */
  bands?: Array<{ aspect: number; uri: string }>;
}

export interface TemplateCtx {
  id: TemplateId;
  ratio: Ratio;
  palette: Palette;
  fonts: FontPlan;
  brandName: string;
  logoUri: string | null;
  logoInfo: LogoInfo | null;
  headline: string;
  hook: string;
  body: string | null;
  cta: string | null;
  bullets: string[];
  quote: { text: string; source: string } | null;
  stat: { value: string; label: string } | null;
  visual: Visual | null;
  /** Real site images picked for image-led templates (ordered). */
  images: ImageMeta[];
  /** Site domain for browser-frame chrome. */
  domain: string | null;
  /** Deterministic composition variant (ad index); falls back to headline length. */
  variant?: number;
  /** Field families saturated in this set (accent/dark/page): pick another. */
  fullFields?: string[];
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Split body copy into short list items (never invents items). */
export function toBullets(body: string | null | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\n|•|;|(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.replace(/^[-–—*\s]+/, "").trim())
    .filter((s) => s.length > 0)
    .slice(0, 5);
}

export const fitAttrs = (kind: "headline" | "body" | "stat", max: number, min: number) =>
  `data-fit="${kind}" data-max="${max}" data-min="${min}"`;

export function H(ctx: TemplateCtx, text: string, max: number, extra = "", key = "headline"): string {
  const m = ctx.ratio === "1:1" ? Math.round(max * 0.86) : ctx.ratio === "4:5" ? Math.round(max * 0.94) : max;
  return `<h1 class="h ${extra}" data-key="${key}" ${fitAttrs("headline", Math.max(m, HEADLINE_MIN_PX), HEADLINE_MIN_PX)}>${noOrphan(esc(text))}</h1>`;
}

/** Orphan guard (fallback for text-wrap:balance/pretty): last two words never split. */
export function noOrphan(html: string): string {
  // Only glue short pairs so narrow columns can still wrap.
  return html.replace(/(\S+) (\S+)$/, (m, a: string, b: string) => (a.length + b.length <= 10 ? `${a}&nbsp;${b}` : m));
}

export function B(text: string | null, max = 44, extra = "", key = "body"): string {
  return text ? `<p class="b ${extra}" data-key="${key}" ${fitAttrs("body", max, BODY_MIN_PX)}>${noOrphan(esc(text))}</p>` : "";
}

export function logo(ctx: TemplateCtx, onBg: string, requested = 76, forceChip = false): string {
  const size = ctx.logoUri ? logoHeight(requested, ctx.logoInfo?.aspect) : requested;
  // Very short names (e.g. "3:17") are usually what the mark itself shows: don't repeat them.
  if (ctx.logoUri && ctx.logoInfo?.tiny && ctx.brandName.replace(/[^\p{L}]/gu, "").length >= 4) {
    // Tiny square favicon: readable tile + the site's brand name in the brand font (no invented wordmark).
    const tile = NEUTRAL_LIGHT;
    const nameColor = pickTextColor(onBg, [ctx.palette.text, NEUTRAL_LIGHT, NEUTRAL_DARK]);
    return `<div class="logo lockup" data-key="logo"><span class="fav" style="background:${tile}"><img class="logo-img" src="${ctx.logoUri}" alt="" style="height:${Math.round(requested * 0.8)}px"/></span><span class="wordmark" style="color:${nameColor};font-size:${Math.round(requested * 0.52)}px">${esc(ctx.brandName)}</span></div>`;
  }
  // Logo legibility is measured in Node (logo.ts); unreadable (or over a photo) -> neutral chip, never recolour.
  if (ctx.logoUri && (forceChip || !logoReadsOn(ctx.logoInfo, onBg))) {
    const chip = logoReadsOn(ctx.logoInfo, NEUTRAL_LIGHT) ? NEUTRAL_LIGHT : NEUTRAL_DARK;
    return `<div class="logo chip" data-key="logo" data-chip="${chip}" style="background:${chip}"><img class="logo-img" src="${ctx.logoUri}" alt="" style="height:${Math.round(size * 0.78)}px"/></div>`;
  }
  const inner = ctx.logoUri
    ? `<img class="logo-img" src="${ctx.logoUri}" alt="" style="height:${size}px"/>`
    : `<span class="wordmark" style="color:${pickTextColor(onBg, [ctx.palette.accent, ctx.palette.text])};font-size:${Math.round(size * 0.72)}px">${esc(ctx.brandName)}</span>`;
  return `<div class="logo" data-key="logo">${inner}</div>`;
}

export function cta(ctx: TemplateCtx, bg = ctx.palette.accent, fg = ctx.palette.accentText, extra = ""): string {
  return ctx.cta
    ? `<div class="cta ${extra}" data-key="cta" ${fitAttrs("body", extra === "big" ? 46 : 40, 28)} style="${extra === "big" ? `background:${bg};color:${fg}` : `--cta-bg:${bg}`}">${esc(ctx.cta)}<span class="arrow">→</span></div>`
    : "";
}

function media(v: Visual | null, surface: string, radius = 36): string {
  if (!v) return "";
  // Faces: no crop, no edits -> contain on a neutral surface.
  const fit = v.hasFace ? "contain" : "cover";
  const pad = "";
  return `<div class="media grow" style="background:${surface};border-radius:${radius}px"><img src="${v.uri}" alt="" style="object-fit:${fit};${pad}"/></div>`;
}

/** Real site screenshot/product strip for text-led templates when there is vertical room. */
function assetStrip(ctx: TemplateCtx): string {
  const v = ctx.visual;
  if (!v || v.generated || ctx.ratio === "1:1") return `<div class="grow"></div>`;
  // Strip crops to the top of the screenshot (crisp, readable UI); faces stay uncropped (contain).
  // Whole image, scaled to the space left (no cut edge, no grey letterbox): the img itself carries the frame.
  // Region crop exists -> fill the strip width (small sources must not render at native size).
  if (v.bands?.length) return bandBox(v.bands, false);
  return `<div class="fitstrip grow"><img src="${v.uri}" alt=""/></div>`;
}

/** Short body only (one phone line-ish); long copy is dropped so the headline stays the hero. */
export function shortBody(t: string | null, max = 70): string | null {
  return t && t.length <= max ? t : null;
}

/** List rows for ads: short items only (≤70 chars, longer copy is dropped, never cut), max 3. */
function shortItems(items: string[]): string[] {
  return items.filter((i) => i.length <= 70).slice(0, 3);
}

/** Rotate away from a saturated field family; page when both brand fields are saturated. */
function resolveField(ctx: TemplateCtx, want: "accent" | "dark"): "accent" | "dark" | "page" {
  const full = ctx.fullFields ?? [];
  const other = want === "accent" ? "dark" : "accent";
  if (!full.includes(want)) return want;
  if (!full.includes(other)) return other;
  return full.includes("page") ? want : "page";
}

function quoteVariant(ctx: TemplateCtx): number {
  const v = Math.abs(ctx.variant ?? ctx.headline.length) % 4;
  return v >= 2 && (ctx.fullFields ?? []).includes("page") ? v - 2 : v;
}

/** Cover-crop keeps ≥ 75% of the image on each axis (no cut-off UI text/digits). */
function bleedOk(ctx: TemplateCtx): boolean {
  const a = ctx.visual?.aspect;
  if (!a) return false;
  const { width, height } = RATIO_PIXELS[ctx.ratio];
  const r = a / (width / height);
  return r >= 0.75 && r <= 1 / 0.75;
}

/** Background field family an ad uses, for per-set rotation. */
export function fieldOf(ctx: TemplateCtx): string {
  switch (ctx.id) {
    case "pain_list": case "ui_card": case "stat_card": return resolveField(ctx, "accent");
    case "offer_card": return "accent";
    case "testimonial": return resolveField(ctx, "dark");
    case "quote_thought": { const v = quoteVariant(ctx); return v === 0 ? resolveField(ctx, "dark") : v === 1 ? resolveField(ctx, "accent") : "page"; }
    case "problem_scene": case "notification": return "photo";
    case "hero_product": return ctx.visual && !ctx.visual.hasFace && ctx.headline.length % 2 === 1 && bleedOk(ctx) ? "photo" : "page";
    default: return isImageTemplate(ctx.id) ? "photo" : "page";
  }
}

/** Full brand field: accent or brand-dark, with a contrast-checked ink. */
function field(ctx: TemplateCtx, want: "accent" | "dark"): { bg: string; ink: string; muted: string; hi: string } {
  const p = ctx.palette;
  const kind = resolveField(ctx, want);
  if (kind === "page") return { bg: p.bg, ink: p.text, muted: p.muted, hi: p.accentOnBg };
  const bg = kind === "accent" ? p.accent : mix(p.accent, NEUTRAL_DARK, 0.82);
  const ink = kind === "accent" ? pickTextColor(bg, [p.accentText, NEUTRAL_LIGHT, NEUTRAL_DARK], 7) : pickTextColor(bg, [NEUTRAL_LIGHT, p.text]);
  return { bg, ink, muted: mix(ink, bg, 0.28), hi: kind === "accent" ? ink : pickTextColor(bg, [p.accent, ink], 3) };
}

/** Real screenshot/product in a browser frame (faces: contain, never cropped). */
/** Box filling the free space; fit.ts picks a band and sizes .band-frame to hug it, centred. */
function bandBox(bands: NonNullable<Visual["bands"]>, chrome: boolean): string {
  const imgs = bands.map((b) => `<img data-aspect="${b.aspect}" src="${b.uri}" alt=""/>`).join("");
  return chrome
    ? `<div class="bandbox grow" data-bands><div class="band-frame device-frame" data-chrome="44"><div class="device-bar"><i></i><i></i><i></i></div>${imgs}</div></div>`
    : `<div class="bandbox grow" data-bands><div class="band-frame plain" data-chrome="0">${imgs}</div></div>`;
}

function device(v: Visual | null): string {
  if (!v) return "";
  const fit = v.hasFace ? "contain" : "cover";
  if (!v.hasFace && v.bands?.length) return bandBox(v.bands, true);
  return `<div class="device grow"><div class="device-bar"><i></i><i></i><i></i></div><div class="device-screen"><img src="${v.uri}" alt="" style="object-fit:${fit}"/></div></div>`;
}

function body(ctx: TemplateCtx): string {
  const p = ctx.palette;
  switch (ctx.id) {
    case "quote_thought": {
      // quote_thought is the common fallback: rotate field (dark / accent / page + real asset) so a set never goes monotone.
      const variant = quoteVariant(ctx);
      if (variant === 3) {
        // Split colour block: brand mark exact + big on the accent block, huge headline on the page.
        const f2 = field(ctx, "accent");
        return `<div class="slab" style="background:${f2.bg}"></div>
        <div class="safe" style="gap:44px">
          <div class="slab-mark">${logo(ctx, f2.bg, 150)}</div>
          ${H(ctx, ctx.headline, 160, "tight", "headline")}
          <div class="grow"></div>
          ${cta(ctx)}
        </div>`;
      }
      const f = variant === 1 ? field(ctx, "accent") : variant === 2 ? { bg: p.bg, ink: p.text, muted: p.muted, hi: p.accentOnBg } : field(ctx, "dark");
      return `<div class="full" style="background:${f.bg}"></div>
      ${variant === 0 ? `<div class="band" style="background:${p.accent}"></div>` : ""}
      <div class="safe" style="gap:44px;color:${f.ink}">
        ${logo(ctx, f.bg, 108)}
        ${variant === 2 ? assetStrip(ctx) : `<div class="grow"></div>`}
        ${variant === 0 ? "" : `<div class="bar" style="background:${f.hi}"></div>`}
        ${H(ctx, ctx.headline, 168, "tight", "headline")}
        <div class="grow"></div>
        ${variant === 0 ? `<div style="color:${p.accentText}">${cta(ctx)}</div>` : cta(ctx)}
      </div>`;
    }
    case "hero_product":
      if (ctx.visual && !ctx.visual.hasFace && ctx.headline.length % 2 === 1 && bleedOk(ctx)) {
        // Full-bleed screenshot, headline bottom over a scrim.
        return `<img class="full" src="${ctx.visual.uri}" alt="" style="object-position:top center"/>
        <div class="full" style="background:linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,.7) 58%, rgba(0,0,0,.9) 100%)"></div>
        <div class="safe" style="color:${NEUTRAL_LIGHT}">
          ${logo(ctx, "#2A2A2A", 76, true)}
          <div class="grow"></div>
          ${H(ctx, ctx.headline, 136, "tight shadow")}
          ${cta(ctx)}
        </div>`;
      }
      return `<div class="safe">
        ${logo(ctx, p.bg)}
        ${H(ctx, ctx.headline, 132, "tight")}
        ${B(shortBody(ctx.body), 40).replace('class="b ', `style="color:${p.muted}" class="b `)}
        ${ctx.visual?.hasFace ? media(ctx.visual, p.surface) : device(ctx.visual)}
        ${cta(ctx)}
      </div>`;
    case "before_after": {
      const before = ctx.hook !== ctx.headline ? ctx.hook : (ctx.body ?? ctx.hook);
      const bt = pickTextColor(p.surface, [p.text]);
      return `<div class="safe" style="gap:28px">
        ${logo(ctx, p.bg)}
        <div class="pane grow" data-box style="background:${p.surface};color:${bt}">
          <div class="tag" style="color:${mix(bt, p.surface, 0.3)}">Before</div>
          <p class="b" data-key="before" ${fitAttrs("body", 54, BODY_MIN_PX)}>${esc(before)}</p>
        </div>
        <div class="pane grow" data-box style="background:${p.accent};color:${p.accentText}">
          <div class="tag" style="color:${mix(p.accentText, p.accent, 0.2)}">After</div>
          ${H(ctx, ctx.headline, 88)}
          ${cta(ctx, p.accentText, p.accent)}
        </div>
      </div>`;
    }
    case "ui_card": {
      const rows = shortItems(ctx.bullets.length ? ctx.bullets : [ctx.body ?? ctx.hook]);
      const f = field(ctx, "accent");
      return `<div class="full" style="background:${f.bg}"></div>
      <div class="safe" style="color:${f.ink}">
        ${logo(ctx, f.bg)}
        <div class="grow"></div>
        ${H(ctx, ctx.headline, 128, "tight")}
        <ul class="rows" data-box data-key="body" ${fitAttrs("body", 52, BODY_MIN_PX)}>
          ${rows.slice(0, 3).map((r) => `<li style="border-color:${mix(f.ink, f.bg, 0.75)}"><span class="check" style="background:${f.ink};color:${f.bg}">✓</span><span class="li-t">${noOrphan(esc(r))}</span></li>`).join("")}
        </ul>
        <div class="grow"></div>
        ${cta(ctx)}
      </div>`;
    }
    case "chat_moment": {
      const bubbleIn = p.dark ? mix(p.bg, NEUTRAL_LIGHT, 0.14) : "#ECEEF2";
      const inText = pickTextColor(bubbleIn, [p.text]);
      return `<div class="safe">
        ${logo(ctx, p.bg)}
        <div class="chat grow" data-box ${fitAttrs("body", 46, BODY_MIN_PX)} data-key="chat">
          <div class="bubble out" style="background:${p.accent};color:${p.accentText}">${esc(ctx.hook)}</div>
          ${ctx.body ? `<div class="bubble in" style="background:${bubbleIn};color:${inText}">${esc(ctx.body)}</div>` : `<div class="bubble in typing" style="background:${bubbleIn};color:${inText}">•••</div>`}
        </div>
        ${H(ctx, ctx.headline, 96)}
        ${cta(ctx)}
      </div>`;
    }
    case "notification":
    case "problem_scene": {
      const scrimBg = "#000000";
      const t = pickTextColor(mix(scrimBg, NEUTRAL_LIGHT, 0.42), [NEUTRAL_LIGHT]);
      const bg = ctx.visual && !ctx.visual.hasFace
        ? `<img class="full" src="${ctx.visual.uri}" alt=""/><div class="full" style="background:${ctx.id === "notification" ? "rgba(0,0,0,.58)" : "linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.35) 30%, rgba(0,0,0,.72) 55%, rgba(0,0,0,.86) 100%)"}"></div>`
        : `<div class="full" style="background:linear-gradient(160deg, ${mix(p.accent, NEUTRAL_DARK, 0.45)}, ${mix(p.accent, NEUTRAL_DARK, 0.82)})"></div>`;
      const notif = ctx.id === "notification"
        ? `<div class="notif" data-key="notification">
            <div class="notif-head"><span class="app" style="background:${p.accent};color:${p.accentText}">${ctx.logoUri ? `<img src="${ctx.logoUri}" alt=""/>` : esc(ctx.brandName.slice(0, 1))}</span><b>${esc(ctx.brandName)}</b><span class="now">now</span></div>
            <p ${fitAttrs("body", 44, BODY_MIN_PX)}>${esc(ctx.hook)}</p>
          </div>`
        : "";
      return `${bg}<div class="safe" style="color:${t}">
        ${logo(ctx, "#2A2A2A")}
        ${ctx.id === "notification" ? H(ctx, ctx.headline, 132, "shadow tight") : ""}
        <div class="grow"></div>
        ${notif}
        ${ctx.id === "notification" ? `<div class="grow"></div>` : H(ctx, ctx.headline, 136, "shadow tight")}
        ${ctx.id === "problem_scene" ? B(shortBody(ctx.body), 42, "shadow") : ""}
        ${cta(ctx)}
      </div>`;
    }
    case "pain_list": {
      const items = shortItems(ctx.bullets.length >= 2 ? ctx.bullets : [ctx.hook, ...(ctx.body ? [ctx.body] : [])]);
      const f = field(ctx, "accent");
      return `<div class="full" style="background:${f.bg}"></div>
      <div class="safe" style="color:${f.ink}">
        ${logo(ctx, f.bg)}
        <div class="grow"></div>
        ${H(ctx, ctx.headline, 128, "tight")}
        <ul class="pains" data-key="body" ${fitAttrs("body", 54, BODY_MIN_PX)}>
          ${items.slice(0, 3).map((i) => `<li><span class="x" style="color:${f.ink};border-color:${f.ink}">✕</span><span class="li-t">${noOrphan(esc(i))}</span></li>`).join("")}
        </ul>
        <div class="grow"></div>
        ${cta(ctx)}
      </div>`;
    }
    case "testimonial": {
      // Review as the ad: quote set as the headline on a brand field, source as a quiet byline.
      const f = field(ctx, "dark");
      return `<div class="full" style="background:${f.bg}"></div>
      <div class="safe" style="color:${f.ink}">
        ${logo(ctx, f.bg)}
        <p class="b kicker" data-key="headline" ${fitAttrs("body", 40, BODY_MIN_PX)} style="color:${f.muted}">${esc(ctx.headline)}</p>
        <div class="grow"></div>
        <div class="bar" style="background:${f.hi}"></div>
        <blockquote class="h q tight" data-key="quote" ${fitAttrs("headline", 112, HEADLINE_MIN_PX)}>${esc(ctx.quote?.text ?? "")}</blockquote>
        <div class="src" style="color:${f.muted}">— ${esc(ctx.quote?.source ?? "")}</div>
        <div class="grow"></div>
        ${cta(ctx)}
      </div>`;
    }
    case "offer_card":
      return `<div class="full" style="background:${p.accent}"></div>
      <div class="orb" style="background:${mix(p.accent, p.accentText, 0.1)}"></div>
      <div class="safe" style="color:${p.accentText}">
        ${logo(ctx, p.accent)}
        <div class="grow"></div>
        ${H(ctx, ctx.headline, 132, "tight")}
        ${B(shortBody(ctx.body), 44)}
        ${cta(ctx, p.accentText, p.accent, "big")}
        <div class="grow"></div>
      </div>`;
    case "stat_card":
      return `<div class="full" style="background:${field(ctx, "accent").bg}"></div>
      <div class="safe" style="color:${field(ctx, "accent").ink}">
        ${logo(ctx, field(ctx, "accent").bg)}
        <div class="grow"></div>
        <div class="stat" data-key="stat" ${fitAttrs("stat", 380, 140)}>${esc(ctx.stat?.value ?? "")}</div>
        ${B(ctx.stat?.label ?? null, 40, "", "claim").replace('class="b ', `style="color:${field(ctx, "accent").muted}" class="b `)}
        <div class="rule" style="background:${field(ctx, "accent").ink}"></div>
        ${H(ctx, ctx.headline, 84)}
        <div class="grow"></div>
        ${cta(ctx)}
      </div>`;
    case "founder_note": {
      // Letter as the ad: full paper field, big serif-free headline, short note, mark as signature.
      const paper = p.dark ? mix(p.accent, NEUTRAL_DARK, 0.85) : "#FBF8F1";
      const ink = pickTextColor(paper, [p.text, NEUTRAL_DARK, NEUTRAL_LIGHT]);
      return `<div class="full" style="background:${paper}"></div>
      <div class="edge" style="background:${p.accent}"></div>
      <div class="safe" style="color:${ink}">
        <div class="tag" style="color:${mix(ink, paper, 0.4)}">A note from ${esc(ctx.brandName)}</div>
        <div class="grow"></div>
        ${H(ctx, ctx.headline, 128, "tight")}
        ${B(shortBody(ctx.body, 160), 42).replace('class="b ', `style="color:${mix(ink, paper, 0.25)}" class="b `)}
        <div class="grow"></div>
        <div class="sign" style="border-color:${mix(ink, paper, 0.8)}">${logo(ctx, paper, 64)}</div>
        ${cta(ctx)}
      </div>`;
    }
    case "minimal_type":
    default:
      return `<div class="safe">
        ${logo(ctx, p.bg)}
        <div class="grow"></div>
        <div class="bar" style="background:${p.accentOnBg}"></div>
        ${H(ctx, ctx.headline, shortBody(ctx.body) ? 136 : 156, "tight")}
        ${B(shortBody(ctx.body), 42).replace('class="b ', `style="color:${p.muted}" class="b `)}
        ${assetStrip(ctx)}
        ${ctx.cta ? `<div class="link" data-key="cta" style="color:${p.accentOnBg};border-color:${p.accentOnBg}">${esc(ctx.cta)} →</div>` : ""}
      </div>`;
  }
}

export function renderTemplateHtml(ctx: TemplateCtx): string {
  const { width, height } = RATIO_PIXELS[ctx.ratio];
  const z = safeZone(ctx.ratio);
  const p = ctx.palette;
  const tall = ctx.ratio === "9:16";
  const gap = tall ? 48 : ctx.ratio === "4:5" ? 40 : 32;
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
${ctx.fonts.css}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${width}px;height:${height}px;overflow:hidden;background:${p.bg}}
.ad{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${p.bg};color:${p.text};font-family:${ctx.fonts.body};-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.safe{position:absolute;top:${z.top}px;bottom:${z.bottom}px;left:${z.x}px;right:${z.x}px;display:flex;flex-direction:column;gap:${gap}px;overflow:hidden}
.full{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.grow{flex:1 1 0;min-height:0}
.h{font-family:${ctx.fonts.heading};font-weight:800;line-height:.98;letter-spacing:-0.035em;text-wrap:balance;overflow-wrap:normal;flex:none}
.h.tight{line-height:.98;letter-spacing:-0.04em}
.b{line-height:1.36;font-weight:450;text-wrap:balance;flex:none}
.li-t,.q,blockquote{text-wrap:balance}
.shadow{text-shadow:0 2px 24px rgba(0,0,0,.35)}
.logo{display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start;width:max-content;max-width:100%}
.logo img{display:block;max-width:420px;object-fit:contain}
.logo.chip{padding:10px 16px;border-radius:10px}
.logo.lockup{gap:20px}
.fav{display:inline-flex;padding:8px;border-radius:12px;flex:none}
.fav img{image-rendering:auto}
.wordmark{font-family:${ctx.fonts.heading};font-weight:800;letter-spacing:-0.02em}
.cta{white-space:nowrap;max-width:100%;overflow:hidden;display:inline-flex;align-items:center;gap:16px;align-self:flex-start;flex:none;padding:0 0 12px;border-bottom:4px solid currentColor;font-weight:700;font-size:40px;line-height:1;letter-spacing:-0.01em}
.cta.wrap{white-space:normal}
.cta.big{font-size:46px;padding:34px 60px;border-bottom:none;border-radius:6px;align-self:stretch;justify-content:space-between}
.arrow{font-weight:500}
.media{position:relative;overflow:hidden;box-shadow:0 30px 60px -30px rgba(0,0,0,.35)}
.bandbox{display:flex;align-items:center;justify-content:center;min-height:200px;overflow:hidden}
.band-frame{flex:none;overflow:hidden;border-radius:24px;box-shadow:0 30px 60px -30px rgba(0,0,0,.4)}
.band-frame.device-frame{background:#1B1C20;border-radius:28px}
.band-frame img{display:block}
.r-4x5 .bandbox,.r-9x16 .bandbox{flex:1 1 40%}
.fitstrip{display:flex;align-items:center;justify-content:flex-start;min-height:240px;overflow:hidden}
.fitstrip img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;border-radius:24px;box-shadow:0 30px 60px -30px rgba(0,0,0,.4)}
.media.strip{min-height:240px}
/* Tall ratios: strip prefers ~40% but shrinks to the space left after the headline (never under the CTA). */
.r-4x5 .media.strip,.r-4x5 .device,.r-9x16 .media.strip,.r-9x16 .device{flex:1 1 40%;min-height:240px}
.media.strip img{object-position:top center}
.media img{position:absolute;inset:0;width:100%;height:100%}
.qmark{font-family:Georgia,serif;font-size:220px;line-height:.6;height:110px;font-weight:700;flex:none}
.qmark.small{font-size:160px;height:80px}
.pane{border-radius:40px;padding:48px 52px;display:flex;flex-direction:column;justify-content:center;gap:24px;overflow:hidden}
.r-1x1 .pane{padding:32px 44px;gap:14px}
.r-1x1 .cta{font-size:36px}
.tag{font-size:28px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;flex:none}
.glow{position:absolute;inset:0}
.ui{border-radius:40px;box-shadow:0 40px 80px -40px rgba(0,0,0,.4),0 0 0 1px rgba(0,0,0,.05);overflow:hidden;display:flex;flex-direction:column}
.ui-head{display:flex;align-items:center;gap:18px;padding:30px 40px;border-bottom:2px solid;font-size:32px;font-weight:700;flex:none}
.ui-title{flex:1}
.dot{width:20px;height:20px;border-radius:50%}
.device{display:flex;flex-direction:column;border-radius:28px;overflow:hidden;background:#1B1C20;box-shadow:0 40px 80px -36px rgba(0,0,0,.5),0 0 0 2px rgba(0,0,0,.06)}
.device-bar{flex:none;height:44px;display:flex;align-items:center;gap:12px;padding:0 22px}
.device-bar i{width:14px;height:14px;border-radius:50%;background:#4A4C55}
.device-screen{position:relative;flex:1;min-height:0;background:#fff}
.device-screen img{position:absolute;inset:0;width:100%;height:100%;object-position:top center}
.rows{list-style:none;display:flex;flex-direction:column;flex:none;line-height:1.25;font-weight:600}
.rows li{display:flex;gap:26px;align-items:flex-start;padding:22px 0;border-bottom:2px solid}
.rows li:last-child{border-bottom:none}
.check{flex:none;width:1.25em;height:1.25em;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.8em;font-weight:800;margin-top:.03em}
.chat{display:flex;flex-direction:column;justify-content:center;gap:26px;line-height:1.3}
.bubble{max-width:84%;padding:30px 38px;border-radius:44px;font-weight:500}
.bubble.out{align-self:flex-end;border-bottom-right-radius:12px}
.bubble.in{align-self:flex-start;border-bottom-left-radius:12px}
.typing{letter-spacing:.2em;font-weight:800}
.notif{background:rgba(255,255,255,.94);color:#111216;border-radius:44px;padding:34px 38px;box-shadow:0 30px 60px -20px rgba(0,0,0,.45);flex:none;line-height:1.3}
.notif-head{display:flex;align-items:center;gap:18px;font-size:32px;margin-bottom:16px}
.notif p{font-size:48px;font-weight:600;letter-spacing:-0.01em}
.notif-head b{flex:1}
.notif .now{color:#5A5D66}
.app{width:60px;height:60px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;overflow:hidden}
.app img{width:78%;height:78%;object-fit:contain}
.pains{list-style:none;display:flex;flex-direction:column;gap:30px;line-height:1.2;font-weight:600;flex:none}
.pains li{display:flex;gap:28px;align-items:flex-start}
.x{flex:none;width:1.3em;height:1.3em;border:3px solid;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.72em;font-weight:800;margin-top:.0em}
.kicker{font-weight:700}
.tcard{border-radius:44px;padding:56px;display:flex;flex-direction:column;justify-content:center;gap:28px;overflow:hidden;box-shadow:0 30px 70px -40px rgba(0,0,0,.35)}
.q{font-weight:700;line-height:1.12}
.src{font-size:30px;font-weight:600;flex:none}
.orb{position:absolute;width:${Math.round(width * 1.1)}px;height:${Math.round(width * 1.1)}px;border-radius:50%;right:-${Math.round(width * 0.45)}px;top:-${Math.round(width * 0.35)}px}
.stat{font-family:${ctx.fonts.heading};font-weight:800;line-height:.95;letter-spacing:-0.05em;flex:none;white-space:nowrap}
.rule{height:4px;width:120px;border-radius:4px;flex:none}
.paper{border-radius:36px;padding:64px 60px;display:flex;flex-direction:column;gap:32px;overflow:hidden;box-shadow:0 40px 80px -50px rgba(0,0,0,.45)}
.sign{border-top:2px solid;padding-top:28px;flex:none}
.band{position:absolute;left:0;right:0;bottom:0;height:${Math.round(z.bottom + 120)}px}
.slab{position:absolute;left:0;right:0;top:0;height:38%}
.slab-mark{height:calc(38% - ${z.top}px - 40px);min-height:120px;display:flex;align-items:center;flex:none}
.edge{position:absolute;left:0;top:0;bottom:0;width:24px}
.bar{width:140px;height:14px;border-radius:8px;flex:none}
.link{font-size:44px;font-weight:700;border-bottom:4px solid;align-self:flex-start;padding-bottom:8px;flex:none}
${isImageTemplate(ctx.id) ? imageCss(ctx) : ""}
</style></head><body><div class="ad t-${ctx.id} r-${ctx.ratio.replace(":", "x")}" data-template="${ctx.id}">${isImageTemplate(ctx.id) ? imageBody(ctx) : body(ctx)}</div></body></html>`;
}

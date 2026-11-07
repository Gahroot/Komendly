// Image-led templates: real site photos/products/screenshots carry the ad; text sits on
// solid panels/cards or on a brand-tinted scrim whose strength is verified on the real
// pixels after rendering (index.ts -> ensureImageContrast).
import { RATIO_PIXELS } from "../../../../src/lib/ads/contracts";
import { NEUTRAL_DARK, NEUTRAL_LIGHT, mix, normalizeHex, pickTextColor } from "./color";
import { placeStyle, type ImageMeta } from "./imagery";
import { isImageTemplateId, safeZone, type TemplateId } from "./layout";
import { B, H, cta, shortBody, esc, logo, type TemplateCtx } from "./templates";

export function isImageTemplate(id: TemplateId): boolean {
  return isImageTemplateId(id);
}

/** Dark brand tint used for scrims (text on it is white). */
export function scrimColor(accent: string): string {
  return mix(accent, "#000000", 0.8);
}

function rgb(hex: string): string {
  const h = (normalizeHex(hex) ?? NEUTRAL_DARK).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
}

/** Mark the first text element of an H()/B() snippet for post-render contrast checks. */
function onImage(html: string, color: string, min: number): string {
  return html.replace(/^<(h1|p) /, `<$1 data-contrast="${color}" data-cmin="${min}" `);
}

function img(m: ImageMeta, w: number, h: number, faceZone?: [number, number], cls = "full"): string {
  return `<img class="${cls}" src="${m.uri}" alt="" style="${placeStyle(m, w, h, faceZone)}"/>`;
}

/** Greedy word-wrap estimate (avg glyph ≈ 0.52em) for layout decisions. */
export function wrapLines(text: string, widthPx: number, fontPx: number): number {
  const cpl = Math.max(1, Math.floor(widthPx / (fontPx * 0.52)));
  let lines = 1, cur = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && cur + 1 + w.length > cpl) { lines++; cur = w.length; } else cur += (cur ? 1 : 0) + w.length;
  }
  return lines;
}

function floatLogo(ctx: TemplateCtx, top: number, left: number): string {
  return `<div class="float-logo" style="top:${top}px;left:${left}px">${logo(ctx, "#808080", 64, true)}</div>`;
}

interface Panel { bg: string; text: string; muted: string; ctaBg: string; ctaFg: string }

/** Solid brand panel: dark brands keep their background (accent CTA); light brands use the accent. */
function panel(ctx: TemplateCtx): Panel {
  const p = ctx.palette;
  if (p.dark) return { bg: p.bg, text: p.text, muted: p.muted, ctaBg: p.accent, ctaFg: p.accentText };
  const t = p.accentText;
  const muted = mix(t, p.accent, 0.12);
  return { bg: p.accent, text: t, muted: pickTextColor(p.accent, [muted, t]), ctaBg: t, ctaFg: pickTextColor(t, [p.accent, p.bg]) };
}

function tiles(n: number, w: number, h: number, gap: number): Array<{ x: number; y: number; w: number; h: number }> {
  const half = (w - gap) / 2;
  if (n <= 1) return [{ x: 0, y: 0, w, h }];
  if (n === 2) return [{ x: 0, y: 0, w: half, h }, { x: half + gap, y: 0, w: half, h }];
  if (n === 3) {
    const big = Math.round(w * 0.58);
    const rh = (h - gap) / 2;
    return [{ x: 0, y: 0, w: big, h }, { x: big + gap, y: 0, w: w - big - gap, h: rh }, { x: big + gap, y: rh + gap, w: w - big - gap, h: rh }];
  }
  const rh = (h - gap) / 2;
  return [{ x: 0, y: 0, w: half, h: rh }, { x: half + gap, y: 0, w: half, h: rh }, { x: 0, y: rh + gap, w: half, h: rh }, { x: half + gap, y: rh + gap, w: half, h: rh }];
}

export function imageBody(ctx: TemplateCtx): string {
  const { width: W, height: Hh } = RATIO_PIXELS[ctx.ratio];
  const z = safeZone(ctx.ratio);
  const p = ctx.palette;
  const sq = ctx.ratio === "1:1";
  const tall = ctx.ratio === "9:16";
  const [a, b] = ctx.images;
  const sc = scrimColor(p.accent);
  const white = pickTextColor(sc, [NEUTRAL_LIGHT]);
  const pn = panel(ctx);
  const body = (max = 42) => B(shortBody(ctx.body), max);
  switch (ctx.id) {
    case "photo_fullbleed": {
      if (!a) return "";
      return `${img(a, W, Hh, [0, 0.5])}
      <div class="full scrim" style="background:linear-gradient(to top, rgb(${rgb(sc)} / var(--s)) 0%, rgb(${rgb(sc)} / var(--s)) var(--tz), rgb(${rgb(sc)} / 0) calc(var(--tz) + 26%))"></div>
      <div class="safe" style="color:${white}">
        ${logo(ctx, "#808080", 64, true)}
        <div class="grow"></div>
        ${onImage(H(ctx, ctx.headline, 112), white, 3)}
        ${ctx.body ? onImage(body(42), white, 4.5) : ""}
        ${cta(ctx)}
      </div>`;
    }
    case "photo_caption": {
      if (!a) return "";
      const card = p.dark ? p.bg : NEUTRAL_LIGHT;
      const ink = pickTextColor(card, [p.text, NEUTRAL_DARK]);
      return `${img(a, W, Hh, [0, 0.45])}
      <div class="full" style="background:linear-gradient(to top, rgb(0 0 0 / .35), rgb(0 0 0 / 0) 45%)"></div>
      <div class="safe">
        ${logo(ctx, "#808080", 64, true)}
        <div class="grow"></div>
        <div class="caption-card" data-box style="background:${card};color:${ink}">
          ${H(ctx, ctx.headline, 84, "q")}
          ${shortBody(ctx.body) ? B(shortBody(ctx.body), 38).replace('class="b ', `style="color:${mix(ink, card, 0.3)}" class="b `) : ""}
          ${cta(ctx)}
        </div>
      </div>`;
    }
    case "photo_split": {
      if (!a) return "";
      // Narrow (45%) text column would stack the headline past 3 lines: set it over the photo instead (no faces under text).
      if (sq && !a.hasFace && wrapLines(ctx.headline, W - Math.round(W * 0.55) - 112, 84) > 3) return imageBody({ ...ctx, id: "photo_fullbleed" });
      if (sq) {
const half = Math.round(W * 0.55);
        return `<div class="slot" style="left:0;top:0;width:${half}px;height:${Hh}px">${img(a, half, Hh)}</div>
        <div class="slot" style="left:${half}px;top:0;right:0;bottom:0;background:${pn.bg}"></div>
        <div class="safe" style="left:${half + 56}px;right:56px;color:${pn.text}">
          ${logo(ctx, pn.bg, 60)}
          <div class="grow"></div>
          ${H(ctx, ctx.headline, 92)}
          <div class="grow"></div>
          ${cta(ctx, pn.ctaBg, pn.ctaFg, "wrap")}
        </div>`;
      }
      const ph = tall ? 820 : 620;
      return `<div class="slot" style="left:0;top:0;width:${W}px;height:${ph}px">${img(a, W, ph)}</div>
      <div class="slot" style="left:0;top:${ph}px;right:0;bottom:0;background:${pn.bg}"></div>
      ${floatLogo(ctx, z.top, z.x)}
      <div class="safe" style="top:${ph + (tall ? 64 : 56)}px;color:${pn.text}">
        ${H(ctx, ctx.headline, 120, "tight")}
        <div class="grow"></div>
        ${cta(ctx, pn.ctaBg, pn.ctaFg)}
      </div>`;
    }
    case "product_spotlight": {
      if (!a) return "";
      const glow = mix(p.accent, p.bg, p.dark ? 0.62 : 0.78);
      return `<div class="full" style="background:radial-gradient(62% 42% at 50% 60%, ${glow}, ${p.bg} 100%)"></div>
      <div class="floor" style="background:radial-gradient(50% 50% at 50% 50%, rgb(0 0 0 / ${p.dark ? 0.5 : 0.18}), transparent 70%)"></div>
      <div class="safe">
        ${logo(ctx, p.bg)}
        ${H(ctx, ctx.headline, 100)}
        <div class="spot grow"><img class="${a.alpha ? "cut" : "card"}" src="${a.uri}" alt=""/></div>
        ${!sq && shortBody(ctx.body) ? B(shortBody(ctx.body), 38).replace('class="b ', `style="color:${p.muted}" class="b `) : ""}
        ${cta(ctx)}
      </div>`;
    }
    case "photo_collage": {
      const imgs = ctx.images.slice(0, sq ? 3 : 4);
      const gh = tall ? 880 : sq ? 600 : 740;
      const gap = 8;
      const grid = tiles(imgs.length, W, gh, gap)
        .map((t, i) => { const m = imgs[i]; return m ? `<div class="slot" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px">${img(m, t.w, t.h)}</div>` : ""; })
        .join("");
      return `<div class="slot" style="inset:0;background:${pn.bg}"></div>${grid}
      ${floatLogo(ctx, z.top, z.x)}
      <div class="safe" style="top:${gh + (sq ? 44 : 60)}px;color:${pn.text}">
        ${H(ctx, ctx.headline, 96)}
        ${!sq && shortBody(ctx.body) ? B(shortBody(ctx.body), 38).replace('class="b ', `style="color:${pn.muted}" class="b `) : ""}
        <div class="grow"></div>
        ${cta(ctx, pn.ctaBg, pn.ctaFg)}
      </div>`;
    }
    case "photo_before_after": {
      if (!a || !b) return "";
      const label = (t: string, bg: string, fg: string) => `<div class="ba-label" style="background:${bg};color:${fg}">${t}</div>`;
      let slots: string;
      let top: number;
      if (sq) {
        const ih = 600, iw = (W - 8) / 2;
        slots = `<div class="slot" style="left:0;top:0;width:${iw}px;height:${ih}px">${img(a, iw, ih)}${label("Before", NEUTRAL_DARK, NEUTRAL_LIGHT)}</div>
          <div class="slot" style="left:${iw + 8}px;top:0;width:${iw}px;height:${ih}px">${img(b, iw, ih)}${label("After", p.accent, p.accentText)}</div>`;
        top = ih + 44;
      } else {
        const ih = tall ? 470 : 400;
        slots = `<div class="slot" style="left:0;top:0;width:${W}px;height:${ih}px">${img(a, W, ih)}${label("Before", NEUTRAL_DARK, NEUTRAL_LIGHT)}</div>
          <div class="slot" style="left:0;top:${ih + 8}px;width:${W}px;height:${ih}px">${img(b, W, ih)}${label("After", p.accent, p.accentText)}</div>`;
        top = Math.max(ih * 2 + 8 + (tall ? 56 : 52), tall ? 0 : 0);
      }
      return `<div class="slot" style="inset:0;background:${pn.bg}"></div>${slots}
      ${floatLogo(ctx, z.top, z.x)}
      <div class="safe" style="top:${top}px;color:${pn.text}">
        ${H(ctx, ctx.headline, 92)}
        ${tall && shortBody(ctx.body) ? B(shortBody(ctx.body), 38).replace('class="b ', `style="color:${pn.muted}" class="b `) : ""}
        <div class="grow"></div>
        ${cta(ctx, pn.ctaBg, pn.ctaFg)}
      </div>`;
    }
    case "screenshot_device": {
      if (!a) return "";
      const phone = tall && a.height >= a.width * 1.4;
      const frameBg = p.dark ? mix(p.bg, NEUTRAL_LIGHT, 0.12) : NEUTRAL_LIGHT;
      const barText = mix(pickTextColor(frameBg, [NEUTRAL_DARK]), frameBg, 0.45);
      const idealH = Math.round(((W - 2 * z.x) * a.height) / a.width) + 64;
      const device = phone
        ? `<div class="phone"><img src="${a.uri}" alt=""/></div>`
        : `<div class="browser" style="max-height:${idealH}px;background:${frameBg}">
            <div class="bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i>
              <span class="url" style="color:${barText};background:${mix(frameBg, p.dark ? NEUTRAL_LIGHT : NEUTRAL_DARK, 0.06)}">${esc(ctx.domain ?? ctx.brandName)}</span></div>
            <div class="vp"><img src="${a.uri}" alt=""/></div>
          </div>`;
      return `<div class="full" style="background:radial-gradient(70% 45% at 50% 62%, ${mix(p.accent, p.bg, p.dark ? 0.55 : 0.75)}, ${p.bg} 100%)"></div>
      <div class="safe">
        ${logo(ctx, p.bg)}
        ${H(ctx, ctx.headline, 96)}
        ${!sq && shortBody(ctx.body) ? B(shortBody(ctx.body), 38).replace('class="b ', `style="color:${p.muted}" class="b `) : ""}
        <div class="device grow">${device}</div>
        ${cta(ctx)}
      </div>`;
    }
    default:
      return "";
  }
}

export function imageCss(ctx: TemplateCtx): string {
  const { height } = RATIO_PIXELS[ctx.ratio];
  return `
.ad{--s:.55;--tz:44%}
.measuring [data-contrast]{color:transparent!important;text-shadow:none!important}
.slot{position:absolute;overflow:hidden}
.slot img.full{position:absolute;inset:0;width:100%;height:100%}
img.full{position:absolute;inset:0;width:100%;height:100%}
.scrim{pointer-events:none}
.float-logo{position:absolute;z-index:2}
.caption-card{border-radius:40px;padding:48px 52px;display:flex;flex-direction:column;gap:24px;flex:none;box-shadow:0 30px 80px -30px rgba(0,0,0,.55);overflow:hidden;max-height:${Math.round(height * 0.62)}px}
.caption-card .qmark.small{height:64px;font-size:150px}
.caption-card .cta{margin-top:6px}
.spot{position:relative}
.spot img{position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;width:auto;height:auto}
.spot img.cut{filter:drop-shadow(0 40px 40px rgba(0,0,0,.28))}
.spot img.card{border-radius:36px;box-shadow:0 50px 90px -40px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.04)}
.floor{position:absolute;left:15%;right:15%;height:120px;bottom:${Math.round(height * 0.24)}px}
.ba-label{position:absolute;left:28px;bottom:28px;font-size:30px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:12px 22px;border-radius:14px}
.device{display:flex;align-items:center;justify-content:center;position:relative}
.browser{width:100%;height:100%;border-radius:28px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 50px 100px -40px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.06)}
.r-9x16 .browser{transform:perspective(2200px) rotateX(6deg);transform-origin:50% 100%}
.bar{height:64px;flex:none;display:flex;align-items:center;gap:12px;padding:0 24px}
.bar i{width:18px;height:18px;border-radius:50%;display:block}
.url{margin-left:18px;flex:1;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600}
.vp{flex:1;position:relative;overflow:hidden}
.vp img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center}
.phone{height:100%;aspect-ratio:9/19.5;border-radius:84px;border:20px solid #0E0F13;overflow:hidden;position:relative;box-shadow:0 50px 100px -40px rgba(0,0,0,.6)}
.phone img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center}
`;
}

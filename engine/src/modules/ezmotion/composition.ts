// Deterministic HyperFrames composition generator: AdSpec + BrandKit + ScenePlan -> index.html.
// Pure (no I/O). One paused GSAP timeline registered on window.__timelines.main.
import type { AdSpec } from "../../../../src/lib/ads/contracts";
import { contrast, luminance, type Palette, parseHex, saturation, withAlpha } from "./colors";
import { type Frame, fitFontSize, safeBox } from "./layout";
import type { ScenePlan } from "./plan";

export interface CompAsset {
  key: string;
  src: string; // path relative to the project dir
  /** Saliency centroid 0..1; push-ins and crops centre on it. */
  focal?: { x: number; y: number };
  kind?: string;
  /** Reads as a photo (no baked-in UI/text): shown without browser chrome. */
  photo?: boolean;
  /** Outer band is wallpaper/empty margin: the push-in may go to 1.2x. */
  trimmable?: boolean;
  width: number;
  height: number;
  hasFace: boolean;
}

export interface CompositionInput {
  spec: AdSpec;
  plan: ScenePlan;
  frame: Frame;
  palette: Palette;
  brandName: string;
  domain: string;
  durationSec: number;
  fontCss: string;
  headingFamily: string;
  bodyFamily: string;
  logo: { src: string; width: number; height: number; plate: string | null } | null;
  product: CompAsset | null;
  secondary: CompAsset | null;
  gsapSrc: string;
  music: { src: string; volume: number } | null;
  /** Full-bleed text-free scene plate (project-relative src). */
  plate?: string | null;
  /** Override the angle/awareness pick. */
  structure?: Structure;
}

export const STRUCTURES = ["story", "walkthrough", "kinetic", "hero", "beforeafter"] as const;
export type Structure = (typeof STRUCTURES)[number];

/**
 * Scene structure from the ad's angle and awareness level:
 * story = hook, pain, reveal, proof, CTA; walkthrough = long UI tour; kinetic = type-led;
 * hero = product orbit; beforeafter = the buyer's moment wiped away by the product.
 */
export function pickStructure(spec: Pick<AdSpec, "angle" | "awareness" | "hook">, product: { hasFace: boolean } | null): Structure {
  const text = `${spec.angle} ${spec.hook}`.toLowerCase();
  const ui = !!product && !product.hasFace;
  const short = spec.hook.split(/\s+/).filter(Boolean).length <= 6;
  if (!product) return spec.awareness === "problem_aware" && !short ? "story" : "kinetic";
  if (ui && /demo|how it works|feature|walk|workflow|setup|by hand|manual|click|setting|have to|cut out|another job/.test(text)) return "walkthrough";
  const words = spec.hook.split(/\s+/).filter(Boolean).length;
  if (words <= 11 && /\bnot (the|a|another)\b|\bvs\.?\b|\bbut\b.*\b(don't|not)\b/.test(text)) return "kinetic";
  if (/before|after|instead|switch|replace|no more|anymore|again|re-\w+|same \w+/.test(text)) return "beforeafter";
  if (spec.awareness === "unaware" || short) return "kinetic";
  if (spec.awareness === "solution_aware") return ui ? "walkthrough" : "story";
  if (spec.awareness === "product_aware" || spec.awareness === "most_aware") return "hero";
  return "story";
}

const TIMES: Record<Structure, Record<"hook" | "turn" | "product", [number, number]>> = {
  story: { hook: [0, 4.1], turn: [3.7, 6.9], product: [6.5, 11] },
  walkthrough: { hook: [0, 3.1], product: [2.7, 9.4], turn: [9, 11.2] },
  kinetic: { hook: [0, 5], turn: [4.6, 8.2], product: [7.8, 10.9] },
  hero: { hook: [0, 2.9], product: [2.5, 7.8], turn: [7.4, 10.9] },
  beforeafter: { hook: [0, 4.6], product: [3.8, 9.4], turn: [9, 11.2] },
};

/** Scene windows in seconds, scaled from a 14 s master to the requested duration. */
export function sceneTimes(duration: number, structure: Structure = "story") {
  const k = duration / 14;
  const r = (v: number) => Math.round(v * k * 100) / 100;
  const m = TIMES[structure];
  const w = (x: [number, number]) => ({ start: r(x[0]), end: r(x[1]) });
  const lastEnd = Math.max(m.hook[1], m.turn[1], m.product[1]);
  return { hook: w(m.hook), turn: w(m.turn), product: w(m.product), end: { start: r(lastEnd - 0.4), end: duration } };
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fam = (f: string) => `'${f.replace(/'/g, "")}', 'Mona Sans', system-ui, sans-serif`;
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

function wordSpans(lines: string[], emphasis: string[], cls: string): string {
  const emph = new Set(emphasis.map(norm));
  return lines
    .map(
      (line) =>
        `<span class="line">${line
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => `<span class="${cls}${emph.has(norm(w)) ? " em" : ""}">${esc(w)}</span>`)
          .join(" ")}</span>`,
    )
    .join("");
}

export function buildComposition(c: CompositionInput): string {
  const { frame: f, plan, spec } = c;
  // Muted brands (low-saturation accent on a light ground) get a confident dark field instead of grey.
  const p0 = c.palette;
  const mono = !c.plate && (saturation(p0.accent) < 0.35 || luminance(p0.accent) < 0.05) && luminance(p0.bg) > 0.4 && luminance(p0.ink) < 0.2;
  const p: Palette = mono ? { bg: p0.ink, ink: p0.bg, accent: p0.bg, accentInk: p0.ink, surface: p0.ink } : p0;
  const box = safeBox(f);
  const structure = c.structure ?? pickStructure(spec, c.product);
  const t = sceneTimes(c.durationSec, structure);
  const tall = f.ratio === "9:16";
  const hookText = plan.hookLines.join(" ");
  const hookH = Math.round(box.h * (tall ? 0.66 : 0.72));
  const hookMax = structure === "kinetic" ? (tall ? 156 : 124) : tall ? 136 : f.ratio === "1:1" ? 104 : 112;
  const hookW = box.w - (plan.hookStyle === "chat" ? 120 : 0);
  const longestLine = Math.max(1, ...plan.hookLines.map((l) => l.length));
  // Each planned line must fit on one row, so planned breaks are the only breaks.
  // Hooks are re-split (same words, same order) into the line count that makes them biggest.
  const hookFit = plan.hookStyle === "chat" ? null : biggestLines(hookText, hookW, hookH, tall ? 6 : 4);
  const hookLines = hookFit?.lines ?? plan.hookLines;
  const hookSize = hookFit ? Math.max(52, hookFit.size) : Math.max(44, Math.min(fitFontSize(hookText, hookW, Math.max(plan.hookLines.length, tall ? 4 : 3), hookMax, 52, 0.52), Math.floor(hookW / (longestLine * 0.55))));
  const headH = Math.round(box.h * (structure === "kinetic" ? 0.6 : 0.46));
  const headFit = biggestLines(spec.headline, box.w, headH, tall ? 5 : 3);
  const headLines = headFit.lines;
  // Planned breaks are the only breaks: the longest line must fit on one row.
  const headLongest = Math.max(1, ...headLines.map((l) => l.length));
  const headSize = Math.max(44, Math.min(headFit.size, Math.floor(box.w / (headLongest * 0.56))));
  const claims = plan.claimIndexes.map((i) => spec.claims[i]?.claim).filter((s): s is string => !!s);
  const chipSize = tall ? 46 : 36;
  const cta = spec.cta?.trim() || "Learn more";

  // Product card geometry.
  const cardW = tall ? box.w : f.ratio === "1:1" ? Math.round(box.w * 0.86) : box.w;
  const big = structure === "walkthrough" || structure === "hero" || structure === "beforeafter";
  const cardH = Math.round(box.h * ((big ? (tall ? 0.84 : 0.8) : tall ? 0.8 : 0.74) - claims.length * (tall ? 0.07 : 0.09)));
  const barH = 56;
  const viewH = cardH - barH;
  const prod = c.product;
  // Show the page zoomed in (~1.3x) so real UI reads on a phone; centred horizontally.
  // Wide screenshots are cropped to the region around the focal point so UI reads big on a phone.
  // A live page capture is already cropped to the hero: show it whole, centred.
  const zoom = !prod || prod.hasFace || prod.key === "live-hero" ? 1 : prod.width >= 1000 && prod.width / prod.height > 0.4 ? (prod.width / prod.height > 1.2 ? 1.3 : 1.2) : 1;
  const fx = Math.min(0.62, Math.max(0.38, prod?.focal?.x ?? 0.5));
  const fy = prod?.focal?.y ?? 0.3;
  const imgW = Math.round(cardW * zoom);
  const imgH = prod ? Math.round((imgW * prod.height) / prod.width) : 0;
  // The pixel check (baked-in UI/text) wins over the stored kind: a "product" image of an app is UI.
  const photoCard = !!prod && (prod.photo ?? (prod.kind !== undefined && prod.kind !== "screenshot"));
  // Real photos (no faces) fill a tall card, about 85% of the safe height minus captions.
  const beforeBg = luminance(p.bg) < 0.2 ? p.bg : p.ink;
  const beforeInk = readableOn(beforeBg, luminance(p.bg) < 0.2 ? p.accent : p.bg);
  const bigPhoto = photoCard && !prod?.hasFace;
  const photoH = Math.round(box.h * (tall ? 0.78 : 0.72) - claims.length * (tall ? 130 : 90));
  // Wide UI screenshots: a big browser card the same size as photo cards. The whole screenshot
  // (never side-cropped) sits sharp in the middle over a blurred, dimmed copy of itself.
  const stage = !!prod && !photoCard && !prod.hasFace && Math.round((cardW * 0.92 * prod.height) / prod.width) < (photoH - barH) * 0.96;
  const scrollPx = prod && plan.productMove === "scroll" ? Math.max(0, Math.min(imgH - viewH, Math.round(viewH * 0.7))) : 0;
  const imgLeft = Math.round(Math.min(0, Math.max(cardW - imgW, cardW / 2 - imgW * fx)));
  const imgTop = scrollPx > 0 ? 0 : Math.round(Math.min(0, Math.max(viewH - imgH, viewH / 2 - imgH * fy)));
  const face = prod?.hasFace ?? false;

  const hookHtml =
    plan.hookStyle === "chat"
      ? `<div class="bubble"><div class="dots"><i></i><i></i><i></i></div><div class="hook-text">${wordSpans(plan.hookLines, plan.emphasis, "w")}</div></div>`
      : `<div class="hook-text" data-fit="${hookW}" data-fith="${hookH}" data-alts="${hookFit ? esc(JSON.stringify(lineAlts(hookText, tall ? 6 : 4))) : ""}">${wordSpans(hookLines, plan.emphasis, "w")}</div>`;

  const logoImg = (cls: string) =>
    c.logo ? `<div class="${cls}${c.logo.plate ? " plate" : ""}"><img src="${esc(c.logo.src)}" alt=""/></div>` : `<div class="${cls} wordmark">${esc(c.brandName)}</div>`;

  const css = `
${c.fontCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${f.width}px;height:${f.height}px;background:${p.bg};overflow:hidden}
#root{position:relative;width:${f.width}px;height:${f.height}px;overflow:hidden;background:${p.bg};color:${p.ink};font-family:${fam(c.bodyFamily)}}
.layer{position:absolute;inset:0}
.field{position:absolute;inset:-6%;background:${c.plate ? p.bg : mono ? `radial-gradient(90% 60% at 30% 20%, ${withAlpha(p.ink, 0.1)}, transparent 70%), ${p.bg}` : `radial-gradient(110% 70% at 15% 10%, ${withAlpha(p.accent, 0.38)}, transparent 62%), radial-gradient(90% 60% at 95% 100%, ${withAlpha(p.accent, 0.26)}, transparent 60%), ${p.bg}`}}
#plate{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg, ${withAlpha(p.bg, 0.78)} 0%, ${withAlpha(p.bg, 0.35)} 45%, ${withAlpha(p.bg, 0.2)} 65%, ${withAlpha(p.bg, 0.85)} 100%)}
.scene{position:absolute;inset:0;padding:${f.safe.top}px ${f.safe.right}px ${f.safe.bottom}px ${f.safe.left}px;display:flex;flex-direction:column;justify-content:center}
.inner{width:100%;display:flex;flex-direction:column;gap:${Math.round(f.width * 0.035)}px}
.line{display:block;width:max-content;max-width:none;white-space:nowrap}
.hl{white-space:nowrap;width:max-content}
.w{display:inline-block;will-change:transform}
.em{color:${p.accent}}
.hook-text{font-family:${fam(c.headingFamily)};font-weight:800;font-size:${hookSize}px;line-height:1.06;letter-spacing:-0.02em}
.bubble{align-self:flex-start;max-width:100%;background:${p.ink};color:${p.bg};border-radius:${Math.round(hookSize * 0.55)}px ${Math.round(hookSize * 0.55)}px ${Math.round(hookSize * 0.55)}px 12px;padding:${Math.round(hookSize * 0.45)}px ${Math.round(hookSize * 0.55)}px;position:relative}
.bubble .hook-text{font-size:${hookSize}px}
.bubble .em{color:${p.accent === p.ink ? p.bg : p.accent}}
.dots{position:absolute;left:${Math.round(hookSize * 0.55)}px;top:${Math.round(hookSize * 0.45)}px;display:flex;gap:14px}
.dots i{display:block;width:22px;height:22px;border-radius:50%;background:${withAlpha(p.bg, 0.6)}}
.kicker{display:flex;align-items:center;gap:18px;font-size:${tall ? 34 : 30}px;font-weight:600;opacity:.85}
.mini-logo{height:${tall ? 72 : 60}px;display:flex;align-items:center}
.mini-logo img{height:100%;width:auto;max-width:${Math.round(box.w * 0.5)}px;object-fit:contain}
.plate{background:${c.logo?.plate ?? p.ink};border-radius:18px;padding:10px 18px}
.mini-logo.plate{height:${tall ? 88 : 76}px}
.wordmark{font-family:${fam(c.headingFamily)};font-weight:800;font-size:${tall ? 48 : 40}px}
.headline{font-family:${fam(c.headingFamily)};font-weight:800;font-size:${headSize}px;line-height:1.05;letter-spacing:-0.02em}
.mask{display:block;overflow:hidden;padding-bottom:.08em}
.mask>span{display:block}
.bar{display:block;height:${Math.round(headSize * 0.14)}px;width:${Math.round(box.w * 0.42)}px;background:${p.accent};border-radius:99px;transform-origin:left center}
.body{font-size:${tall ? 40 : 34}px;line-height:1.3;opacity:.85;max-width:${Math.round(box.w * 0.95)}px}
.card{position:relative;width:${cardW}px;height:${bigPhoto || stage ? photoH : prod && imgH < viewH ? imgH + (photoCard ? 0 : barH) : cardH}px;align-self:center;border-radius:28px;overflow:hidden;background:#fff;box-shadow:0 40px 90px rgba(0,0,0,.35),0 0 0 1px ${withAlpha(p.ink, 0.12)}}
.card-bar{height:${barH}px;background:#f1f2f4;display:flex;align-items:center;gap:12px;padding:0 22px;border-bottom:1px solid #e3e5e8}
.card-bar i{display:block;width:16px;height:16px;border-radius:50%;background:#d4d7dc}
.url{margin-left:14px;flex:1;height:34px;border-radius:17px;background:#fff;color:#555b66;font:500 20px/34px ${fam(c.bodyFamily)};padding:0 18px;white-space:nowrap;overflow:hidden}
.view{position:relative;width:${cardW}px;height:${stage ? photoH - barH : bigPhoto ? photoH : Math.min(viewH, imgH || viewH)}px;overflow:hidden;background:#fff}
${stage ? `.view{display:flex;align-items:center;justify-content:center;background:#0b0c0f}
.view .backdrop{position:absolute;inset:-60px;width:calc(100% + 120px);height:calc(100% + 120px);object-fit:cover;filter:blur(36px) brightness(.5) saturate(1.1)}
.view #shot{position:relative;display:block;width:92%;height:auto;border-radius:16px;box-shadow:0 30px 70px rgba(0,0,0,.55)}` : ""}
${stage ? "" : bigPhoto ? `.view img{display:block;width:100%;height:100%;object-fit:cover;object-position:${Math.round(fx * 100)}% ${Math.round((prod?.focal?.y ?? 0.5) * 100)}%}` : `.view img{display:block;width:${imgW}px;margin-left:${imgLeft}px;margin-top:${imgTop}px;height:${imgH}px;object-position:top center}`}
.chips{width:${cardW}px;align-self:center;display:flex;flex-direction:column;gap:${tall ? 20 : 14}px;align-items:flex-start;margin-top:${tall ? 8 : 0}px}
.chip{display:flex;align-items:center;gap:16px;background:${p.ink};color:${p.bg};border-radius:99px;padding:${Math.round(chipSize * 0.42)}px ${Math.round(chipSize * 0.75)}px;font-weight:700;font-size:${chipSize}px;line-height:1.15;max-width:100%}
.chip b{flex:none;display:flex;align-items:center;justify-content:center;width:${Math.round(chipSize * 1.15)}px;height:${Math.round(chipSize * 1.15)}px;border-radius:50%;background:${p.accent};color:${p.accentInk};font-size:${Math.round(chipSize * 0.75)}px}
.end{align-items:center;text-align:center}
.before{background:${luminance(p.bg) < 0.2 ? p.bg : p.ink};color:${beforeInk}}\n.before .em{color:inherit}
.wipe{background:${p.bg}}
.rule{width:${Math.round(f.width * 0.08)}px;height:4px;border-radius:2px;background:${p.accent};opacity:.8}
.big-logo img{height:100%;width:auto;image-rendering:-webkit-optimize-contrast}
.end .inner{align-items:center;gap:${Math.round(f.width * 0.05)}px}
.big-logo{height:${Math.round(f.width * (tall ? 0.09 : 0.08))}px;display:flex;align-items:center;justify-content:center}
.big-logo img{height:100%;width:auto;max-width:${Math.round(box.w * 0.8)}px;object-fit:contain}
.big-logo.plate{padding:16px 28px;border-radius:22px;height:${Math.round(f.width * (tall ? 0.12 : 0.1))}px}
.big-logo.wordmark{font-size:${Math.round(f.width * 0.11)}px}
.cta{display:inline-flex;align-items:center;gap:20px;background:${p.accent};color:${p.accentInk};font-family:${fam(c.headingFamily)};font-weight:800;font-size:${tall ? 68 : 56}px;padding:${tall ? 36 : 30}px ${tall ? 72 : 60}px;border-radius:99px;box-shadow:0 24px 60px ${withAlpha(p.accent, 0.35)}}
.domain{font-size:${tall ? 36 : 32}px;font-weight:600;opacity:.75;letter-spacing:.01em}
.endline{font-family:${fam(c.headingFamily)};font-weight:800;font-size:${headSize}px;line-height:1.05;max-width:${box.w}px;white-space:normal}
`;

  const productHtml = prod
    ? `<div class="card" id="card">${photoCard ? "" : `<div class="card-bar"><i></i><i></i><i></i><div class="url">${esc(c.domain)}</div></div>`}<div class="view">${stage ? `<img class="backdrop" src="${esc(prod.src)}" alt=""/>` : ""}<img id="shot" src="${esc(prod.src)}" alt=""/></div></div>`
    : `<div class="card" id="card" style="background:${p.surface};display:flex;align-items:center;justify-content:center">${logoImg("big-logo")}</div>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${f.width}, height=${f.height}"/>
<title>${esc(c.brandName)} ad</title>
<script src="${esc(c.gsapSrc)}"></script>
<style>${css}</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${f.width}" data-height="${f.height}" data-duration="${c.durationSec}">
  <div class="layer" id="bg"><div class="field" id="field"></div>${c.plate ? `<img id="plate" src="${esc(c.plate)}" alt=""/><div class="scrim"></div>` : ""}</div>
  <section class="scene clip${structure === "beforeafter" ? " before" : ""}" id="s-hook" data-start="${t.hook.start}" data-duration="${r2(t.hook.end - t.hook.start)}"><div class="inner" id="hook-inner">${hookHtml}</div></section>
  <section class="scene clip" id="s-turn" data-start="${t.turn.start}" data-duration="${r2(t.turn.end - t.turn.start)}"><div class="inner" id="turn-inner">
    <div class="kicker" id="kicker">${logoImg("mini-logo")}</div>
    <div class="headline" data-fit="${box.w}" data-fith="${headH}">${headLines.map((l) => `<span class="mask"><span class="hl">${esc(l)}</span></span>`).join("")}</div>
    <span class="bar" id="bar"></span>
    ${plan.showBody && spec.body ? `<p class="body" id="body">${esc(spec.body)}</p>` : ""}
  </div></section>
  <section class="scene clip${structure === "beforeafter" ? " wipe" : ""}" id="s-product" data-start="${t.product.start}" data-duration="${r2(t.product.end - t.product.start)}"><div class="inner" id="product-inner" style="perspective:1600px">
    ${productHtml}
    ${claims.length ? `<div class="chips">${claims.map((cl) => `<div class="chip"><b>\u2713</b><span>${esc(cl)}</span></div>`).join("")}</div>` : ""}
  </div></section>
  <section class="scene clip end" id="s-end" data-start="${t.end.start}" data-duration="${r2(t.end.end - t.end.start)}"><div class="inner" id="end-inner">
    ${logoImg("big-logo")}
    <div class="endline" id="endline" data-fit="${Math.round(box.w * 0.92)}" data-fith="${Math.round(box.h * 0.42)}">${headLines.map((l) => `<span class="line">${esc(l)}</span>`).join("")}</div>
    <div class="cta" id="cta"><span>${esc(cta)}</span><span>\u2192</span></div>
    <div class="rule" id="rule"></div>
    <div class="domain" id="domain">${esc(c.domain)}</div>
  </div></section>
  ${c.music ? `<audio id="music" src="${esc(c.music.src)}" data-start="0" data-duration="${c.durationSec}" data-volume="${c.music.volume}"></audio>` : ""}
</div>
<script>${FIT_SCRIPT}</script>
<script>
${timelineScript({ t, structure, stage, push: prod?.trimmable ? 1.2 : 1.07, plate: !!c.plate, duration: c.durationSec, style: plan.hookStyle, move: plan.productMove, scrollPx, face, focal: `${Math.round(fx * 100)}% ${Math.round(fy * 100)}%`, hasProduct: !!prod, claims: claims.length, width: f.width, hasBody: plan.showBody && !!spec.body })}
</script>
</body></html>
`;
  return html;
}

/** Fits [data-fit] text so its widest planned line spans data-fit px (and the block stays under data-fith px), measured with real fonts. */
// [data-alts]: regroups the existing .w nodes (GSAP keeps its targets) into the split that is
// biggest with the loaded font's real metrics. Then every [data-fit] block is scaled to fill its box.
export const FIT_SCRIPT = `(function(){var cv=document.createElement("canvas").getContext("2d");
function regroup(el){var alts=el.dataset.alts?JSON.parse(el.dataset.alts):null;if(!alts||!alts.length)return;var ws=Array.prototype.slice.call(el.querySelectorAll(".w"));var cs=getComputedStyle(el);cv.font=cs.fontWeight+" 100px "+cs.fontFamily;var lh=1.06,best=null;
alts.forEach(function(a){var i=0,mw=1;a.forEach(function(c){var t=ws.slice(i,i+c).map(function(w){return w.textContent}).join(" ");mw=Math.max(mw,cv.measureText(t).width*1.02);i+=c});var s=Math.min(+el.dataset.fit/mw*100,+el.dataset.fith/(a.length*lh));if(!best||s>best.s*1.03)best={a:a,s:s}});
var lines=el.querySelectorAll(".line"),proto=lines[0];lines.forEach(function(l){l.remove()});var i=0;best.a.forEach(function(c){var l=proto.cloneNode(false);ws.slice(i,i+c).forEach(function(w,k){if(k)l.appendChild(document.createTextNode(" "));l.appendChild(w)});i+=c;el.appendChild(l)});el.style.fontSize=Math.floor(best.s)+"px"}
function fit(){document.querySelectorAll("[data-alts]").forEach(regroup);document.querySelectorAll("[data-fit]").forEach(function(el){var ls=el.querySelectorAll(".line,.hl");if(!ls.length)return;for(var k=0;k<3;k++){var fs=parseFloat(getComputedStyle(el).fontSize),m=0;ls.forEach(function(l){m=Math.max(m,l.scrollWidth)});var h=el.scrollHeight;if(!m||!h)return;var s=Math.min(+el.dataset.fit/m,+el.dataset.fith/h);el.style.fontSize=Math.floor(fs*s)+"px"}})}
fit();if(document.fonts){document.fonts.ready.then(fit)}})();`;

/** `want` if it reaches 4.5:1 on `bg`, else mixed toward white/black until it does. */
export function readableOn(bg: string, want: string): string {
  if (contrast(bg, want) >= 4.5) return want;
  const target = luminance(bg) < 0.5 ? "#ffffff" : "#000000";
  const a = parseHex(want), b = parseHex(target);
  if (!a || !b) return target;
  for (let t = 0.1; t <= 1; t += 0.1) {
    const mix = `#${a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * t).toString(16).padStart(2, "0")).join("")}`;
    if (contrast(bg, mix) >= 4.5) return mix;
  }
  return target;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Line split that makes `text` as large as possible inside w x h: tries 1..maxLines balanced
 * splits and keeps the one whose limiting dimension allows the biggest font.
 */
export function biggestLines(text: string, w: number, h: number, maxLines = 6, em = 0.56, lh = 1.06): { lines: string[]; size: number } {
  let best = { lines: [text], size: 0 };
  const nWords = text.split(/\s+/).filter(Boolean).length;
  for (let n = 1; n <= Math.min(maxLines, nWords); n++) {
    const lines = balanceLines(text, n);
    // Never trade readability for size: no stray short words, no line ending on a glue word.
    const bad = lines.some((l, i) => l.length < 5 || (i < lines.length - 1 && GLUE.has((l.split(" ").at(-1) ?? "").toLowerCase().replace(/[^a-z&]/g, ""))));
    if (bad && n > 1) continue;
    const longest = Math.max(1, ...lines.map((l) => l.length));
    const size = Math.min(w / (longest * em), h / (lines.length * lh));
    if (size > best.size * 1.04) best = { lines, size };
  }
  return { lines: best.lines, size: Math.floor(best.size) };
}

/** Word counts per line for each balanced 1..maxLines split (the page picks the biggest with real font metrics). */
export function lineAlts(text: string, maxLines: number): number[][] {
  const n = text.split(/\s+/).filter(Boolean).length;
  const out: number[][] = [];
  for (let k = 1; k <= Math.min(maxLines, n); k++) {
    const counts = balanceLines(text, k).map((l) => l.split(/\s+/).length);
    if (!out.some((o) => o.join() === counts.join())) out.push(counts);
  }
  return out;
}

export function splitBalanced(text: string, maxLines: number): string[] {
  return balanceLines(text, Math.min(maxLines, Math.max(2, Math.round(text.length / 16))));
}

const GLUE = new Set(["a", "an", "the", "to", "of", "in", "on", "for", "and", "or", "with", "your", "my", "our", "no", "not", "is", "at", "by", "from", "&"]);

/**
 * Best break of `text` into exactly `n` lines (or fewer if too few words): minimises the
 * squared deviation from equal length, penalises a short last line (orphan) and breaking
 * after a short glue word ("of", "the", "your"...) so short phrases stay together.
 */
export function balanceLines(text: string, n: number): string[] {
  const ws = text.split(/\s+/).filter(Boolean);
  const k = Math.max(1, Math.min(n, ws.length));
  if (k === 1) return [ws.join(" ")];
  const target = ws.join(" ").length / k;
  const len = (a: number, b: number) => ws.slice(a, b).join(" ").length;
  const memo = new Map<string, { cost: number; cuts: number[] }>();
  const best = (start: number, lines: number): { cost: number; cuts: number[] } => {
    const key = `${start}:${lines}`;
    const hit = memo.get(key);
    if (hit) return hit;
    let out = { cost: Infinity, cuts: [] as number[] };
    if (lines === 1) {
      const l = len(start, ws.length);
      out = { cost: (l - target) ** 2 + ((l < target * 0.6 && l < 8) || (ws.length - start === 1 && l < 8) ? 400 : 0), cuts: [] };
    } else {
      for (let e = start + 1; e <= ws.length - lines + 1; e++) {
        const l = len(start, e);
        const last = (ws[e - 1] ?? "").toLowerCase().replace(/[^a-z&]/g, "");
        // Never split "3 a.m.", "24 hours", "$5 off": a line must not end on a number.
        const glue = GLUE.has(last) || /^[$€£]?\d[\d.,:%]*$/.test(ws[e - 1] ?? "") ? 900 : 0;
        const rest = best(e, lines - 1);
        // A tiny line ("I", "not") reads as a stray word, wherever it sits.
        const tiny = l < Math.max(5, target * 0.4) ? 400 : 0;
        const cost = (l - target) ** 2 + glue + tiny + rest.cost;
        if (cost < out.cost) out = { cost, cuts: [e, ...rest.cuts] };
      }
    }
    memo.set(key, out);
    return out;
  };
  const cuts = [0, ...best(0, k).cuts, ws.length];
  return cuts.slice(1).map((e, i) => ws.slice(cuts[i], e).join(" "));
}

interface TlOpts {
  t: ReturnType<typeof sceneTimes>;
  structure: Structure;
  plate: boolean;
  stage: boolean;
  push: number;
  duration: number;
  style: ScenePlan["hookStyle"];
  move: ScenePlan["productMove"];
  focal: string;
  scrollPx: number;
  face: boolean;
  hasProduct: boolean;
  claims: number;
  width: number;
  hasBody: boolean;
}

/** GSAP timeline source. Deterministic: no clocks, no randomness, finite repeats only. */
export function timelineScript(o: TlOpts): string {
  const { t } = o;
  const hookIn = o.style === "chat" ? 0.9 : 0.05;
  const P = t.product.start;
  const span = r2(t.product.end - P);
  const productTween = o.face
    ? `tl.from("#card",{y:120,opacity:0,duration:1,ease:"expo.out"},${P + 0.05});`
    : o.structure === "hero"
      ? `tl.fromTo("#card",{rotationY:-32,rotationX:12,scale:.82,opacity:0},{rotationY:0,rotationX:0,scale:1,opacity:1,duration:1.5,ease:"expo.out",transformOrigin:"50% 50%"},${P + 0.05});
tl.to("#card",{rotationY:7,rotationX:-3,duration:${r2(span - 1.6)},ease:"sine.inOut"},${P + 1.55});`
      : o.structure === "beforeafter"
        ? `tl.fromTo("#s-product",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:1,ease:"expo.inOut"},${P});
tl.from("#card",{x:-120,scale:.94,duration:1.3,ease:"expo.out"},${P + 0.1});`
        : `tl.from("#card",{y:160,rotationX:${o.move === "tilt" ? 24 : 12},scale:.92,opacity:0,duration:1.2,ease:"expo.out",transformOrigin:"50% 100%"},${P + 0.05});`;
  const shotTween = !o.hasProduct || o.face
    ? ""
    : o.stage
      ? `tl.fromTo("#shot",{scale:1},{scale:${o.push},duration:${span},ease:"sine.inOut",transformOrigin:"${o.push > 1.1 ? "50% 50%" : o.focal}"},${P});
tl.fromTo(".backdrop",{scale:1},{scale:1.12,duration:${span},ease:"sine.inOut"},${P});`
    : o.structure === "walkthrough"
      ? `tl.fromTo("#shot",{scale:1},{scale:1.32,duration:${r2(span * 0.45)},ease:"power2.inOut",transformOrigin:"${o.focal}"},${P + 0.9});
${o.scrollPx > 0 ? `tl.to("#shot",{y:-${o.scrollPx},duration:${r2(span * 0.4)},ease:"power2.inOut"},${r2(P + 0.9 + span * 0.45)});` : `tl.to("#shot",{xPercent:-6,duration:${r2(span * 0.4)},ease:"sine.inOut"},${r2(P + 0.9 + span * 0.45)});`}`
      : o.scrollPx > 0
        ? `tl.to("#shot",{y:-${o.scrollPx},duration:${r2(span - 1.4)},ease:"power2.inOut"},${P + 0.9});`
        : `tl.fromTo("#shot",{scale:1},{scale:1.12,duration:${span},ease:"sine.inOut",transformOrigin:"${o.focal}"},${P});`;
  const kinetic = o.structure === "kinetic";
  return `
const tl = gsap.timeline({ paused: true });
// Ambient layer: slow drift across the whole ad so nothing ever sits still.
tl.fromTo("#field",{scale:1,x:0},{scale:1.08,x:${-Math.round(o.width * 0.03)},duration:${o.duration},ease:"sine.inOut"},0);
${o.plate ? `tl.fromTo("#plate",{scale:1.04,yPercent:0},{scale:1.16,yPercent:-3,duration:${o.duration},ease:"sine.inOut",transformOrigin:"50% 60%"},0);` : ""}
// 1. Hook: the buyer's own words, word by word.
${o.style === "chat" ? `tl.from(".bubble",{scale:.6,y:60,opacity:0,duration:.5,ease:"back.out(1.6)",transformOrigin:"0% 100%"},.1);
tl.to(".dots i",{y:-10,duration:.18,ease:"sine.inOut",yoyo:true,repeat:1,stagger:.08},.3);
tl.to(".dots",{opacity:0,duration:.15},.85);` : ""}
${kinetic
  ? `tl.from("#s-hook .w",{scale:1.7,opacity:0,duration:.6,ease:"expo.out",stagger:.2,transformOrigin:"50% 60%"},${hookIn});`
  : `tl.from("#s-hook .w",{y:${o.style === "chat" ? 24 : 56},opacity:0,filter:"blur(6px)",duration:.7,ease:"expo.out",stagger:.07},${hookIn});`}
${o.structure === "beforeafter" ? "" : `tl.to("#hook-inner",{y:-40,opacity:0,duration:.5,ease:"power3.in"},${r2(t.hook.end - 0.5)});`}
// 2. Turn: the headline.
tl.from("#kicker",{y:30,opacity:0,duration:.5,ease:"power3.out"},${t.turn.start + 0.15});
${kinetic ? `tl.from("#s-turn .hl",{xPercent:(i)=>i%2?40:-40,opacity:0,duration:.8,ease:"expo.out",stagger:.14},${t.turn.start + 0.2});` : ""}
tl.from("#s-turn .hl",{yPercent:110,duration:.9,ease:"expo.out",stagger:.1},${t.turn.start + 0.2});
tl.from("#bar",{scaleX:0,duration:.7,ease:"power3.inOut"},${t.turn.start + 0.7});
${o.hasBody ? `tl.from("#body",{y:30,opacity:0,duration:.5,ease:"power3.out"},${t.turn.start + 0.9});` : ""}
tl.to("#turn-inner",{y:-40,opacity:0,duration:.5,ease:"power3.in"},${r2(t.turn.end - 0.45)});
// 3. Product: real site asset in a rebuilt browser frame, claims from the spec only.
${productTween}
${shotTween}
${o.claims ? `tl.from(".chip",{x:-60,opacity:0,duration:.8,ease:"expo.out",stagger:.3},${P + 1.2});` : ""}
tl.to("#product-inner",{y:-40,opacity:0,duration:.5,ease:"power3.in"},${r2(t.product.end - 0.45)});
// 4. End: logo + CTA.
${o.plate ? `tl.to("#plate",{opacity:.35,duration:1,ease:"sine.inOut"},${t.end.start});` : ""}
tl.from("#s-end .big-logo",{y:24,scale:.94,opacity:0,duration:.9,ease:"expo.out"},${t.end.start + 0.1});
tl.from("#endline",{y:24,opacity:0,duration:.8,ease:"expo.out"},${t.end.start + 0.35});
tl.from("#cta",{y:28,opacity:0,duration:.8,ease:"expo.out"},${t.end.start + 0.6});
tl.from("#rule",{scaleX:0,duration:.8,ease:"expo.inOut"},${t.end.start + 0.8});
tl.from("#domain",{opacity:0,duration:.6,ease:"sine.out"},${t.end.start + 0.95});
window.__timelines["main"] = tl;
`;
}

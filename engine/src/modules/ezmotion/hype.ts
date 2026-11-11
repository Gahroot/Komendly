// Hype edit: a fast-cut, beat-locked social video. Every cut lands on a beat of a 128 BPM grid;
// the score (score-synth) is built from the same grid, so impacts, whooshes and the drop hit
// exactly on the picture. Pure: AdSpec + script + assets -> { html, score, beats }.
import { contrast, luminance, type Palette } from "./colors";
import { esc, lineAlts, readableOn } from "./composition";
import type { HypeCard, HypeScript } from "./hype-script";
import { type Frame, safeBox } from "./layout";

export const BPM = 128;
export const BEAT = 60 / BPM;

export interface HypeAsset {
  src: string;
  width: number;
  height: number;
  /** Reads as a photo (cover-crop full bleed); false = UI/screenshot (shown framed). */
  photo: boolean;
  focal: { x: number; y: number };
}

export interface HypeInput {
  script: HypeScript;
  cta: string;
  frame: Frame;
  palette: Palette;
  brandName: string;
  domain: string;
  fontCss: string;
  headingFamily: string;
  bodyFamily: string;
  logo: { src: string; plate: string | null } | null;
  assets: HypeAsset[];
  gsapSrc: string;
  seed: number;
}

export type ShotKind = "pain" | "turn" | "drop" | "cut" | "proof" | "end";
export interface Shot {
  id: string;
  kind: ShotKind;
  startBeat: number;
  beats: number;
  card?: HypeCard;
  asset?: number;
  /** Field the card flips to on its mid-card hit. */
  flip?: { bg: string; ink: string; em: string };
}

/** Beat plan: pains 2 beats each, turn 2, drop on a bar line, montage 1-2 beats per cut, end 6. */
export function planShots(script: HypeScript, assetCount: number, photoIndexes: number[] = []): Shot[] {
  const shots: Shot[] = [];
  let b = 0;
  const push = (s: Omit<Shot, "id" | "startBeat">) => {
    shots.push({ ...s, id: `s${shots.length}`, startBeat: b });
    b += s.beats;
  };
  const pains = script.cards.filter((c) => c.role === "pain");
  const turn = script.cards.find((c) => c.role === "turn");
  const proofs = script.cards.filter((c) => c.role === "proof");
  let asset = 0;
  // The middle pain card sits over a real photo when there is one.
  // Only a real photo (never a page capture or UI) sits behind a pain card.
  const painPhoto = photoIndexes[0];
  pains.forEach((card, i) => push({ kind: "pain", beats: 2, card, ...(i === 1 && painPhoto !== undefined ? { asset: painPhoto } : {}) }));
  if (painPhoto !== undefined) asset = painPhoto + 1;
  const turnBeats = 2 + ((4 - ((b + 2) % 4)) % 4);
  if (turn) push({ kind: "turn", beats: turnBeats, card: turn });
  else if (b % 4) push({ kind: "turn", beats: 4 - (b % 4) });
  push({ kind: "drop", beats: 2 });
  // Montage: proof over a photo (2 beats), then quick 1-beat cuts of the rest.
  const montage = Math.max(proofs.length, Math.min(4, assetCount));
  for (let i = 0; i < montage; i++) {
    const card = proofs[i];
    const a = assetCount ? asset++ % assetCount : undefined;
    // Proof with no image to sit on becomes a full-size text card on a brand field.
    push({ kind: card ? (a !== undefined ? "proof" : "pain") : "cut", beats: card ? 2 : 1, ...(card ? { card } : {}), ...(a !== undefined ? { asset: a } : {}) });
  }
  // End card: 6 beats, padded (max 3) so the video ends on a bar line. Short is fine for social.
  push({ kind: "end", beats: 5 + ((4 - ((b + 5) % 4)) % 4) });
  return shots;
}

export const beatTime = (beat: number) => Math.round(beat * BEAT * 1000) / 1000;
export function totalBeats(shots: Shot[]): number {
  const last = shots.at(-1);
  return last ? last.startBeat + last.beats : 0;
}

/** score-synth score: pulse bed, energy rising into the drop, hits on every cut. */
export function buildScore(shots: Shot[], seed: number): Record<string, unknown> {
  const duration = beatTime(totalBeats(shots));
  const drop = shots.find((s) => s.kind === "drop");
  const turn = shots.find((s) => s.kind === "turn");
  const end = shots.find((s) => s.kind === "end");
  const progressions = [["Am", "F", "C", "G"], ["Em", "C", "G", "D"], ["Dm", "Bb", "F", "C"], ["Cm", "Ab", "Eb", "Bb"]];
  const hits: Array<Record<string, unknown>> = [];
  for (const s of shots) {
    const t = beatTime(s.startBeat);
    if (s.kind === "pain") hits.push({ t, sfx: "impact", gain: s.startBeat === 0 ? 1 : 0.7 });
    if (s.kind === "turn") for (let k = 2; k < s.beats; k += 2) hits.push({ t: beatTime(s.startBeat + k), sfx: "impact", gain: 0.6 });
    if (s.kind === "cut" || s.kind === "proof") hits.push({ t, sfx: s.asset === undefined ? "impact" : "whoosh-short", gain: 0.8 });
    if (s.kind === "proof" && s.asset !== undefined) hits.push({ t: beatTime(s.startBeat + 0.5), sfx: "snap", gain: 0.6 });
    if (s.kind === "drop") hits.push({ t, sfx: "riser" }, { t, sfx: "sub-drop" }, { t, sfx: "impact" });
    if (s.kind === "end") hits.push({ t, sfx: "impact", gain: 0.8 }, { t: beatTime(s.startBeat + 2), sfx: "pop", gain: 0.7 });
  }
  return {
    bpm: BPM,
    duration,
    seed,
    chords: progressions[seed % progressions.length],
    style: "pulse",
    sections: [
      { name: "hook", from: 0, energy: 0.6 },
      ...(turn ? [{ name: "build", from: beatTime(turn.startBeat), energy: 0.75 }] : []),
      ...(drop ? [{ name: "drop", from: beatTime(drop.startBeat), energy: 1 }] : []),
      ...(end ? [{ name: "end", from: beatTime(end.startBeat), energy: 0.8 }] : []),
    ],
    hits,
    room: "room",
    duck: 0.6,
    ending: "resolve",
  };
}

const fam = (f: string) => `'${f.replace(/'/g, "")}', 'Mona Sans', system-ui, sans-serif`;
const normW = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

function cardText(text: string, emphasis: string | null, fitW: number, fitH: number, cls: string, maxLines = 3): string {
  const ws = text.split(/\s+/).filter(Boolean);
  const em = emphasis ? normW(emphasis) : null;
  const spans = ws.map((w) => `<span class="w${em && normW(w) === em ? " em" : ""}">${esc(w)}</span>`).join(" ");
  // One line per word group; the fit script regroups into the split that is biggest.
  return `<div class="${cls}" data-fit="${fitW}" data-fith="${fitH}" data-alts="${esc(JSON.stringify(lineAlts(text, Math.min(maxLines, ws.length))))}"><span class="line">${spans}</span></div>`;
}

export function buildHype(c: HypeInput): { html: string; shots: Shot[]; durationSec: number } {
  const f = c.frame;
  const box = safeBox(f);
  const p = c.palette;
  const shots = planShots(c.script, c.assets.length, c.assets.map((a, i) => (a.photo ? i : -1)).filter((i) => i >= 0));
  const duration = beatTime(totalBeats(shots));
  const dark = luminance(p.bg) <= luminance(p.ink) ? p.bg : p.ink;
  const light = dark === p.bg ? p.ink : p.bg;
  const accentOk = contrast(p.accent, dark) >= 2.2 && contrast(p.accent, light) >= 1.6;
  const accent = accentOk ? p.accent : readableOn(dark, p.accent);
  const onAccent = readableOn(accent, contrast(accent, light) > contrast(accent, dark) ? light : dark);
  const tall = f.ratio === "9:16";
  // Card backgrounds cycle dark -> accent -> light so every cut changes the whole frame.
  const fields = [
    { bg: dark, ink: readableOn(dark, light), em: readableOn(dark, accent) },
    { bg: accent, ink: onAccent, em: readableOn(accent, dark === onAccent ? light : dark) },
    { bg: light, ink: readableOn(light, dark), em: readableOn(light, accent) },
  ];
  const assetHtml = (i: number | undefined, id: string) => {
    if (i === undefined) return "";
    const a = c.assets[i];
    if (!a) return "";
    const pos = `${Math.round(a.focal.x * 100)}% ${Math.round(a.focal.y * 100)}%`;
    return a.photo
      ? `<div class="media" id="${id}-m"><img class="photo" src="${esc(a.src)}" style="object-position:${pos}" alt=""/></div>`
      : `<div class="media" id="${id}-m"><img class="backdrop" src="${esc(a.src)}" alt=""/><div class="device"><img class="shot" src="${esc(a.src)}" style="object-position:${pos}" alt=""/></div></div>`;
  };
  const logo = (cls: string) =>
    c.logo ? `<div class="${cls}${c.logo.plate ? " plate" : ""}"><img src="${esc(c.logo.src)}" alt=""/></div>` : `<div class="${cls} wordmark">${esc(c.brandName)}</div>`;

  for (const s of shots) if (s.kind === "turn" && s.beats > 2) s.flip = { bg: fields[1]!.bg, ink: fields[1]!.ink, em: fields[1]!.em };
  let painIdx = 0;
  const sections = shots
    .map((s) => {
      const start = beatTime(s.startBeat);
      const dur = Math.round((beatTime(s.startBeat + s.beats) - start) * 1000) / 1000;
      const open = (bg: string, ink: string, extra = "") => `<section class="scene clip ${s.kind}" id="${s.id}" data-start="${start}" data-duration="${dur}" style="background:${bg};color:${ink}"><div class="cam" id="${s.id}-cam">${extra}`;
      const close = `</div></section>`;
      if (s.kind === "pain" || s.kind === "turn") {
        const onPhoto = s.asset !== undefined;
        const fld = s.kind === "turn" ? fields[2]! : fields[painIdx++ % 2 === 0 ? 0 : 1]!;
        const ink = onPhoto ? "#ffffff" : fld.ink;
        const text = s.card ? cardText(s.card.text, s.card.emphasis, box.w, Math.round(box.h * (onPhoto ? 0.5 : 0.62)), "big", tall ? 4 : 3) : logo("mid-logo");
        return `${open(onPhoto ? "#000" : fld.bg, ink, onPhoto ? `${assetHtml(s.asset, s.id)}<div class="shade"></div>` : "")}<div class="stage" style="--em:${onPhoto ? accent : fld.em}">${text}</div>${close}`;
      }
      if (s.kind === "drop") {
        return `${open(dark, readableOn(dark, light))}<div class="ring" id="${s.id}-ring" style="border-color:${accent}"></div><div class="stage center">${c.logo ? logo("drop-logo") : `<div class="drop-logo wordmark">${cardText(c.brandName, null, box.w, Math.round(box.h * 0.3), "big", 2)}</div>`}</div>${close}`;
      }
      if (s.kind === "proof" && s.asset === undefined && s.card) {
        return `${open(accent, onAccent)}<div class="stage" style="--em:${onAccent}">${cardText(s.card.text, null, box.w, Math.round(box.h * 0.5), "big", tall ? 4 : 3)}</div>${close}`;
      }
      if (s.kind === "cut" || s.kind === "proof") {
        const caption = s.card ? `<div class="caption" id="${s.id}-cap" style="background:${accent};color:${onAccent}">${cardText(s.card.text, null, Math.round(box.w * 0.9), Math.round(box.h * 0.2), "cap")}</div>` : "";
        return `${open("#000", "#fff", assetHtml(s.asset, s.id))}${caption}${close}`;
      }
      return `${open(dark, readableOn(dark, light))}<div class="stage end-stack">${logo("end-logo")}${cardText(c.script.endLine, null, box.w, Math.round(box.h * 0.44), "endline", tall ? 4 : 3)}<div class="cta" id="cta" style="color:${readableOn(dark, accent)}">${esc(c.cta)} at ${esc(c.domain)}</div></div>${close}`;
    })
    .join("\n");

  const css = `
${c.fontCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${f.width}px;height:${f.height}px;background:${dark};overflow:hidden}
#root{position:relative;width:${f.width}px;height:${f.height}px;overflow:hidden;font-family:${fam(c.bodyFamily)}}
.scene{position:absolute;inset:0;overflow:hidden}
.cam{position:absolute;inset:0;will-change:transform}
.stage{position:absolute;left:${f.safe.left}px;top:${f.safe.top}px;width:${box.w}px;height:${box.h}px;display:flex;flex-direction:column;justify-content:center}
.stage.center{align-items:center}
.big,.endline,.cap{font-family:${fam(c.headingFamily)};font-weight:900;line-height:.98;letter-spacing:-.03em;text-transform:uppercase;font-size:200px}
.line{display:block;width:max-content;white-space:nowrap}
.w{display:inline-block;will-change:transform}
.em{color:var(--em)}
.media{position:absolute;inset:0;overflow:hidden;background:#000}
.photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.backdrop{position:absolute;inset:-80px;width:calc(100% + 160px);height:calc(100% + 160px);object-fit:cover;filter:blur(40px) brightness(.45) saturate(1.2)}
.device{position:absolute;left:50%;top:50%;width:${Math.round(f.width * 0.9)}px;height:${Math.round(Math.min(f.height * 0.62, f.width * 0.9 * 1.15))}px;transform:translate(-50%,-50%);border-radius:28px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.6);background:#fff}
.device .shot{display:block;width:100%;height:100%;object-fit:cover}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.35) 45%,rgba(0,0,0,.6))}
.caption{position:absolute;left:${f.safe.left}px;bottom:${f.safe.bottom + Math.round(box.h * 0.04)}px;max-width:${box.w}px;padding:${tall ? 26 : 20}px ${tall ? 34 : 28}px;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.4)}
.ring{position:absolute;left:50%;top:50%;width:${Math.round(f.width * 0.5)}px;height:${Math.round(f.width * 0.5)}px;margin:-${Math.round(f.width * 0.25)}px 0 0 -${Math.round(f.width * 0.25)}px;border:${Math.round(f.width * 0.02)}px solid;border-radius:50%;opacity:0}
.drop-logo{height:${Math.round(f.width * 0.3)}px;display:flex;align-items:center;justify-content:center}
.drop-logo img,.end-logo img,.mid-logo img{height:100%;width:auto;max-width:${Math.round(box.w * 0.9)}px;object-fit:contain}
.drop-logo.wordmark{height:auto;width:${box.w}px}
.mid-logo{height:${Math.round(f.width * 0.14)}px;display:flex;justify-content:center}
.plate{background:${light};border-radius:24px;padding:18px 30px}
.wordmark{font-family:${fam(c.headingFamily)};font-weight:900;font-size:${Math.round(f.width * 0.13)}px;line-height:1;height:auto}
.end-stack{gap:${Math.round(f.width * 0.05)}px;align-items:center;text-align:center}
.end-stack .line{margin:0 auto}
.end-logo{height:${Math.round(f.width * 0.11)}px;display:flex;justify-content:center}
.end-logo.wordmark{font-size:${Math.round(f.width * 0.08)}px}
.cta{font-family:${fam(c.headingFamily)};font-weight:900;font-size:${tall ? 58 : 50}px;line-height:1.1;max-width:${box.w}px;text-align:center}
.domain{font-size:${tall ? 38 : 32}px;font-weight:700;opacity:.8}
`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${f.width}, height=${f.height}"/>
<title>${esc(c.brandName)} hype ad</title>
<script src="${esc(c.gsapSrc)}"></script>
<style>${css}</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="${f.width}" data-height="${f.height}" data-duration="${duration}">
${sections}
</div>
<script>${HYPE_FIT}</script>
<script>
${hypeTimeline(shots, duration, c.seed)}
</script>
</body></html>
`;
  return { html, shots, durationSec: duration };
}

/**
 * Sizes every [data-fit] block from the loaded font's real metrics (canvas, with the block's
 * text-transform and letter-spacing), so it works while a scene is still hidden. Picks the
 * line split (data-alts word counts) that gives the biggest type inside data-fit x data-fith.
 */
export const HYPE_FIT = `(function(){var cv=document.createElement("canvas").getContext("2d");
function fit(){document.querySelectorAll("[data-fit]").forEach(function(el){var ws=Array.prototype.slice.call(el.querySelectorAll(".w"));if(!ws.length)return;var cs=getComputedStyle(el);var up=cs.textTransform==="uppercase";cv.font=cs.fontWeight+" 100px "+cs.fontFamily;try{cv.letterSpacing=(parseFloat(cs.letterSpacing)/parseFloat(cs.fontSize)*100||0)+"px"}catch(e){}
var lh=parseFloat(cs.lineHeight)/parseFloat(cs.fontSize)||1;var alts=el.dataset.alts?JSON.parse(el.dataset.alts):[[ws.length]];var best=null;
alts.forEach(function(a){var i=0,mw=1;a.forEach(function(c){var t=ws.slice(i,i+c).map(function(w){return w.textContent}).join(" ");if(up)t=t.toUpperCase();mw=Math.max(mw,cv.measureText(t).width);i+=c});var s=Math.min(+el.dataset.fit/mw*100*0.96,+el.dataset.fith/(a.length*lh));if(!best||s>best.s*1.03)best={a:a,s:s}});
var lines=el.querySelectorAll(".line"),proto=lines[0];lines.forEach(function(l){l.remove()});var i=0;best.a.forEach(function(c){var l=proto.cloneNode(false);ws.slice(i,i+c).forEach(function(w,k){if(k)l.appendChild(document.createTextNode(" "));l.appendChild(w)});i+=c;el.appendChild(l)});el.style.fontSize=Math.floor(best.s)+"px"})}
fit();if(document.fonts){document.fonts.ready.then(fit)}})();`;

/** Decaying shake as GSAP keyframes (deterministic). */
function shake(sel: string, at: number, amount: number): string {
  const k = [1, -0.75, 0.5, -0.32, 0.18, 0];
  const frames = k.map((v, i) => `{x:${Math.round(v * amount)},y:${Math.round(-v * amount * 0.6 * (i % 2 ? -1 : 1))},duration:0.045}`).join(",");
  return `tl.to("${sel}",{keyframes:[${frames}],ease:"none"},${at});`;
}

export function hypeTimeline(shots: Shot[], duration: number, seed: number): string {
  const lines: string[] = ["const tl = gsap.timeline({ paused: true });"];
  const half = Math.round((BEAT / 2) * 1000) / 1000;
  shots.forEach((s, i) => {
    const t = beatTime(s.startBeat);
    const len = beatTime(s.startBeat + s.beats) - t;
    const cam = `#${s.id}-cam`;
    const dir = (seed + i) % 2 ? 1 : -1;
    if (s.kind === "pain" || s.kind === "turn" || (s.kind === "proof" && s.asset === undefined)) {
      lines.push(`tl.fromTo("${cam}",{scale:1.16,rotation:${dir * 1.5}},{scale:1,rotation:0,duration:.32,ease:"expo.out"},${t});`);
      lines.push(`tl.from("#${s.id} .w",{scale:2.1,opacity:0,y:30,duration:.2,ease:"expo.out",stagger:${half}},${t});`);
      lines.push(`tl.to("${cam}",{scale:1.06,duration:${Math.max(0.2, len - 0.32).toFixed(3)},ease:"none"},${(t + 0.32).toFixed(3)});`);
      if (s.asset !== undefined) lines.push(`tl.fromTo("#${s.id}-m",{scale:1.25},{scale:1.05,duration:${len.toFixed(3)},ease:"power2.out"},${t});`);
      lines.push(shake(cam, t, s.startBeat === 0 ? 26 : 16));
      // Long cards get a mid-card hit: punch + field flip, so nothing holds still for long.
      for (let k = 2; k < s.beats; k += 2) {
        const at = beatTime(s.startBeat + k);
        lines.push(`tl.fromTo("${cam}",{scale:1.1},{scale:1,duration:.28,ease:"expo.out"},${at});`);
        if (s.flip) lines.push(`tl.set("#${s.id}",{backgroundColor:"${s.flip.bg}",color:"${s.flip.ink}"},${at});tl.set("#${s.id} .stage",{"--em":"${s.flip.em}"},${at});`);
        lines.push(shake(cam, at, 14));
      }
    } else if (s.kind === "drop") {
      lines.push(`tl.fromTo("#${s.id} .drop-logo",{scale:2.4,opacity:0},{scale:1,opacity:1,duration:.28,ease:"expo.out"},${t});`);
      lines.push(`tl.fromTo("#${s.id}-ring",{scale:.3,opacity:.95},{scale:3.4,opacity:0,duration:.8,ease:"expo.out"},${t});`);
      lines.push(`tl.to("#${s.id} .drop-logo",{scale:1.08,duration:${(len - 0.28).toFixed(3)},ease:"none"},${(t + 0.28).toFixed(3)});`);
      lines.push(shake(cam, t, 34));
    } else if (s.kind === "cut" || s.kind === "proof") {
      lines.push(`tl.fromTo("#${s.id}-m",{xPercent:${dir * 28},scale:1.3,filter:"blur(16px)"},{xPercent:0,scale:1.12,filter:"blur(0px)",duration:.2,ease:"power3.out"},${t});`);
      lines.push(`tl.to("#${s.id}-m",{scale:1.02,duration:${Math.max(0.2, len - 0.2).toFixed(3)},ease:"none"},${(t + 0.2).toFixed(3)});`);
      if (s.kind === "proof") {
        lines.push(`tl.from("#${s.id}-cap",{scale:.4,opacity:0,rotation:${dir * -4},duration:.22,ease:"back.out(2.2)"},${(t + half).toFixed(3)});`);
        lines.push(shake(cam, t + half, 10));
      }
    } else {
      lines.push(`tl.fromTo("${cam}",{scale:1.12},{scale:1,duration:.35,ease:"expo.out"},${t});`);
      lines.push(`tl.from("#${s.id} .end-logo",{y:-40,opacity:0,duration:.3,ease:"expo.out"},${t});`);
      lines.push(`tl.from("#${s.id} .endline .w",{scale:1.9,opacity:0,duration:.2,ease:"expo.out",stagger:${(half / 2).toFixed(3)}},${(t + 0.1).toFixed(3)});`);
      lines.push(`tl.from("#cta",{scale:.3,opacity:0,duration:.3,ease:"back.out(2)"},${beatTime(s.startBeat + 2)});`);
      // CTA pulses on every beat until the end.
      for (let b = s.startBeat + 3; b < s.startBeat + s.beats; b++) lines.push(`tl.fromTo("#cta",{scale:1.07},{scale:1,duration:.3,ease:"power2.out"},${beatTime(b)});`);
      lines.push(shake(cam, t, 14));
    }
  });
  lines.push(`tl.set({}, {}, ${duration});`);
  lines.push(`window.__timelines["main"] = tl;`);
  return lines.join("\n");
}

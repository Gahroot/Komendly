#!/usr/bin/env node
// node kit/bin/new-video.mjs <folder> <9:16|16:9|1:1> [--example ad]
// Starts a composition in <folder>: a blank, working canvas (brand palette and fonts from ./brand/look.css when it
// exists, a living background, kit/punch.js wired). The video's structure is yours: an ad, a story, an explainer,
// a celebration, a footage edit... `--example ad` instead copies a finished sample ad (hook, product demo, quote,
// offer, end card) to rewrite; read kit/punch/*.html for worked examples either way.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const example = args.includes("--example") ? args[args.indexOf("--example") + 1] : null;
const [folder, ratio] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--example");
if (!folder || !["9:16", "16:9", "1:1"].includes(ratio ?? "")) { console.log(JSON.stringify({ ok: false, error: "usage: node kit/bin/new-video.mjs <folder> <9:16|16:9|1:1>" })); process.exit(1); }
const wide = ratio === "16:9";
const dir = resolve(folder);
if (existsSync(join(dir, "index.html"))) { console.log(JSON.stringify({ ok: false, error: `${folder}/index.html already exists; edit it instead` })); process.exit(1); }
mkdirSync(join(dir, "kit", "fonts"), { recursive: true });
const square = ratio === "1:1";
const [W, H] = wide ? [1920, 1080] : square ? [1080, 1080] : [1080, 1920];
let html;
if (example === "ad") html = readFileSync(join(KIT, "punch", wide ? "punch-16x9.html" : "punch-9x16.html"), "utf8");
else {
  const short = Math.min(W, H), padX = Math.round(W * 0.074);
  const vars = { W, H, PADX: padX, INNERW: W - 2 * padX, LABEL: Math.round(short * 0.032), BIG: Math.round(short * (wide ? 0.13 : 0.14)), BIGGER: Math.round(short * (wide ? 0.17 : 0.19)), TOP1: Math.round(H * 0.3), TOP2: Math.round(H * 0.3 + short * (wide ? 0.16 : 0.17)) };
  html = readFileSync(join(KIT, "punch", "canvas.html"), "utf8").replace(/__([A-Z0-9]+)__/g, (m, k) => String(vars[k] ?? m));
}
cpSync(join(KIT, "punch.js"), join(dir, "kit", "punch.js"));
for (const f of ["fraunces-normal.woff2", "fraunces-italic.woff2", "bricolage-grotesque-normal.woff2", "host-grotesk-normal.woff2"]) {
  const src = [join(KIT, "fonts", f), join(KIT, "fonts", f.replace(/-(normal|italic)\.woff2$/, ""), f)].find(existsSync);
  if (src) cpSync(src, join(dir, "kit", "fonts", f));
}

// Brand: map the look tokens onto the sample's palette (a dark stage, light paper cards, the brand accent).
const project = process.cwd();
const look = join(project, "brand", "look.json");
let brand = null;
if (existsSync(look)) {
  const t = JSON.parse(readFileSync(look, "utf8")).tokens ?? {};
  const hex = (h) => (/^#[0-9a-f]{6}$/i.test(h ?? "") ? h : null);
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const mix = (a, b, w) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - w) + parseInt(b.slice(i, i + 2), 16) * w).toString(16).padStart(2, "0")).join("");
  const field = hex(t["--field"]) ?? "#111111", ink = hex(t["--ink"]) ?? "#ffffff";
  let accent = hex(t["--accent"]) ?? "#ff6b35";
  const darkField = lum(field) < 0.3;
  const stage = darkField ? field : mix(accent, "#05070c", 0.82);
  const paper = darkField ? (lum(ink) > 0.6 ? ink : "#f7f5f0") : field;
  let accent2 = hex(t["--accent-2"]) ?? mix(accent, "#ffffff", 0.35);
  const dist = (a, b) => [1, 3, 5].reduce((s, i) => s + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0);
  if (dist(accent2, accent) < 90) accent2 = mix(accent, "#ffffff", 0.45);
  // Accent words sit on the dark stage: lift the accent until it reads (3:1).
  const rl = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => (Math.max(rl(a), rl(b)) + 0.05) / (Math.min(rl(a), rl(b)) + 0.05);
  for (let w = 0.1; cr(accent, stage) < 3 && w <= 1; w += 0.1) accent = mix(t["--accent"] ?? accent, "#ffffff", w);
  for (let w = 0.1; cr(accent2, stage) < 3 && w <= 1; w += 0.1) accent2 = mix(accent2, "#ffffff", 0.1);
  brand = { stage, paper, accent, accent2 };
  // The sample's background glows, in brand colours.
  for (const [from, to] of [["#1f4250", mix(accent2, stage, 0.7)], ["#3a2018", mix(accent, stage, 0.7)], ["#3b2160", mix(accent2, stage, 0.7)], ["#4a1b3c", mix(accent, stage, 0.7)], ["#10131c", stage], ["#ff6b35", accent], ["#ff7aa8", accent], ["#2bb3a3", accent2], ["#8f7bff", accent2], ["#0f1d24", stage], ["#1a1026", stage]]) html = html.split(from).join(to);
  // The brand's fonts (installed into <folder>/assets by the library) when they're bundled.
  mkdirSync(join(dir, "brand"), { recursive: true });
  cpSync(join(project, "brand", "look.css"), join(dir, "brand", "look.css"));
  cpSync(look, join(dir, "brand", "look.json"));
  let head = "";
  try {
    const out = JSON.parse(execFileSync(process.execPath, [join(KIT, "bin", "library.mjs"), "look", dir, "brand"], { encoding: "utf8" }).trim().split("\n").pop());
    head = (out.head ?? []).join("\n");
  } catch { /* sample fonts stay */ }
  const vars = `:root { --ink: ${stage}; --ink-2: ${mix(stage, "#ffffff", 0.07)}; --paper: ${paper}; --accent: ${accent}; --accent-2: ${accent2}; --muted: ${mix(paper, stage, 0.45)};${t["--display"] ? ` --display: ${t["--display"]};` : ""}${t["--text"] ? ` --text: ${t["--text"]};` : ""} }`;
  html = html.replace("</style>", `  /* Brand palette (from ./brand/look.css): stage = background, paper = cards and light text. */\n  ${vars}\n</style>${head ? "\n" + head.replace(/<link[^>]*>/g, "") : ""}`);
}
writeFileSync(join(dir, "index.html"), html);
console.log(JSON.stringify({
  ok: true,
  file: `${folder}/index.html`,
  brand,
  size: `${W}x${H}`,
  next: example === "ad" ? [
    ...(square ? ["1:1 asked: this sample is 9:16; set #root, body and data-width/height to 1080x1080 and re-lay out every scene."] : []),
    "This is a SAMPLE ad (a " + (wide ? "salon booking app" : "bike repair shop") + "): rewrite every word, name, price, card, quote and the end card for THIS request and ./concept.md, or restructure it. No sample word may survive.",
    "Set the length on #root data-duration and the timeline; check stills with hf snapshot.",
  ] : [
    "A blank canvas: plan the scenes THIS video needs (./concept.md), replace the PLACEHOLDER scene and beats, and set the length on #root data-duration and in tl.set.",
    "Worked examples of the craft (density, layering, carries between scenes): kit/punch/punch-9x16.html and punch-16x9.html (ads), kit/patterns.md.",
    "Check stills with hf snapshot.",
  ],
}));

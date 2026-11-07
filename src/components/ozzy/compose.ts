import { OZZY_PALETTE, type PaletteKey } from "./palette";
import { BODY, CAPE, CAPE_LONG, COLLAR, EAR_L, EAR_R, HEAD, PAW_WAVE, TAIL } from "./sprite/body";
import { CHILL_HAT_DX, CHILL_HAT_DY, CURL, CURL_EARS, CURL_EYE } from "./sprite/chill";
import { BLUSH, EYES, EYES_BLINK, MOUTHS, MOUTH_TALK, WARM } from "./sprite/face";
import { BANG, CRESCENT, HEART, QUESTION, SPARKLE, ZZZ } from "./sprite/fx";
import { HAT } from "./sprite/hat";
import type { Layer } from "./sprite/layer";
import { GOGGLES, LAPTOP, ORB, PANEL, WAND } from "./sprite/props";
import type { OzzyExpression, OzzyForm } from "./types";

/** Full canvas grid: 40x40 sprite plus margins for hops and fx. */
export const G = 48;
export const OX = 4;
export const OY = 6;

export const KEYS = Object.keys(OZZY_PALETTE) as PaletteKey[];
const INDEX: Record<string, number> = Object.fromEntries(KEYS.map((k, i) => [k, i + 1]));

export type Glyph = "zzz" | "question" | "bang" | "heart" | null;

export interface Pose {
  form: OzzyForm;
  expression: OzzyExpression;
  blink: boolean;
  talk: boolean;
  bodyDy: number;
  headDx: number;
  headDy: number;
  eyeDx: number;
  eyeDy: number;
  hatDy: number;
  earL: number;
  earR: number;
  tail: number; // signed shear in cells at the tail tip
  cape: number; // phase for flutter
  wave: number | null; // paw dx when waving
  orbDx: number;
  orbDy: number;
  glyph: Glyph;
  glyphDy: number;
  sparkles: ReadonlyArray<{ x: number; y: number }>;
  progress?: { ready: number; total: number };
}

export function emptyGrid(): Uint8Array {
  return new Uint8Array(G * G);
}

type Shear = (row: number, rows: number) => number;
const none: Shear = () => 0;

function paint(grid: Uint8Array, l: Layer, dx = 0, dy = 0, shear: Shear = none): void {
  const n = l.rows.length;
  for (let r = 0; r < n; r++) {
    const row = l.rows[r] ?? "";
    const gy = l.y + r + dy + OY;
    if (gy < 0 || gy >= G) continue;
    const s = shear(r, n);
    for (let c = 0; c < row.length; c++) {
      const ch = row[c] ?? ".";
      if (ch === ".") continue;
      const gx = l.x + c + dx + s + OX;
      if (gx < 0 || gx >= G) continue;
      grid[gy * G + gx] = INDEX[ch] ?? 0;
    }
  }
}

function progressBar(grid: Uint8Array, p: { ready: number; total: number }, dy: number): void {
  const frac = p.total > 0 ? Math.max(0, Math.min(1, p.ready / p.total)) : 0;
  const filled = Math.round(frac * 7);
  const y = PANEL.y + PANEL.rows.length + 1 + dy + OY;
  for (let i = 0; i < 7; i++) {
    const x = PANEL.x + 1 + i + OX;
    grid[y * G + x] = INDEX[i < filled ? "g" : "b"] ?? 0;
  }
}

function composeChill(grid: Uint8Array, p: Pose): void {
  paint(grid, CURL, 0, p.bodyDy);
  paint(grid, HAT, CHILL_HAT_DX, CHILL_HAT_DY + p.bodyDy + p.hatDy);
  paint(grid, CURL_EARS, 0, p.bodyDy + p.earR);
  paint(grid, CURL_EYE, 0, p.bodyDy);
}

/** Build the cell grid for one frame. Pure: same pose, same grid. */
export function compose(p: Pose, grid: Uint8Array = emptyGrid()): Uint8Array {
  grid.fill(0);
  const f = p.form;
  if (f === "ascended") paint(grid, CRESCENT, 0, p.bodyDy - 1);

  if (f === "chill") {
    composeChill(grid, p);
  } else {
    const tailShear: Shear = (r, n) => Math.round(p.tail * (1 - r / n));
    const capeShear: Shear = (r, n) => Math.round(Math.sin(p.cape + r * 0.6) * (r / n) * 1.2);
    const hx = p.headDx;
    const hy = p.headDy + p.bodyDy;
    paint(grid, TAIL, 0, p.bodyDy, tailShear);
    paint(grid, f === "ascended" ? CAPE_LONG : CAPE, 0, p.bodyDy, capeShear);
    paint(grid, BODY, 0, p.bodyDy);
    paint(grid, COLLAR, 0, p.bodyDy);
    paint(grid, HEAD, hx, hy);
    if (WARM.has(p.expression)) paint(grid, BLUSH, hx, hy);
    const eyes = p.blink && p.expression !== "cool" ? EYES_BLINK : EYES[p.expression];
    paint(grid, eyes, hx + p.eyeDx, hy + p.eyeDy);
    paint(grid, p.talk ? MOUTH_TALK : MOUTHS[p.expression], hx, hy);
    paint(grid, EAR_L, hx, hy + p.earL);
    paint(grid, EAR_R, hx, hy + p.earR);
    paint(grid, HAT, hx, hy + p.hatDy);
    if (p.wave !== null) paint(grid, PAW_WAVE, hx + p.wave, hy);
    if (f === "classic") paint(grid, WAND, 0, p.bodyDy);
    if (f === "explorer") paint(grid, ORB, p.orbDx, p.orbDy + p.bodyDy);
    if (f === "creator") paint(grid, LAPTOP, 0, p.bodyDy);
    if (f === "adventurer") paint(grid, GOGGLES, hx, hy + p.hatDy);
    if (f === "developer") {
      paint(grid, PANEL, 0, p.orbDy);
      if (p.progress) progressBar(grid, p.progress, p.orbDy);
    }
  }

  for (const s of p.sparkles) paint(grid, SPARKLE, Math.round(s.x), Math.round(s.y));
  const gy = Math.round(p.glyphDy);
  if (p.glyph === "zzz") for (const z of ZZZ) paint(grid, z, 0, gy);
  if (p.glyph === "question") paint(grid, QUESTION, 0, gy);
  if (p.glyph === "bang") paint(grid, BANG, 0, gy);
  if (p.glyph === "heart") paint(grid, HEART, 0, gy);
  return grid;
}

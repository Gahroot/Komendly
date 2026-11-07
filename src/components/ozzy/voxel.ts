import { G, KEYS } from "./compose";
import { GLOW_KEYS, OZZY_PALETTE } from "./palette";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

interface Swatch {
  base: string;
  lit: string;
  dark: string;
  glow: boolean;
}

/** Precomputed per palette index (1-based; 0 = empty). */
export const SWATCHES: ReadonlyArray<Swatch | null> = [
  null,
  ...KEYS.map((k) => {
    const hex = OZZY_PALETTE[k];
    return { base: hex, lit: shade(hex, k === "o" ? 0.12 : 0.28), dark: shade(hex, -0.32), glow: GLOW_KEYS.has(k) };
  }),
];

/**
 * Paint the cell grid as chunky voxels: base fill, lit top edge and darker
 * bottom/right edge where the neighbour differs (fake extrusion).
 */
export function paintVoxels(ctx: Ctx, grid: Uint8Array, n: number): void {
  ctx.clearRect(0, 0, G * n, G * n);
  const edge = n >= 3 ? Math.max(1, Math.round(n * 0.22)) : 0;
  for (let y = 0; y < G; y++) {
    for (let x = 0; x < G; x++) {
      const v = grid[y * G + x] ?? 0;
      const sw = SWATCHES[v];
      if (!sw) continue;
      const px = x * n;
      const py = y * n;
      ctx.fillStyle = sw.base;
      ctx.fillRect(px, py, n, n);
      if (!edge) continue;
      const up = y > 0 ? grid[(y - 1) * G + x] : 0;
      const down = y < G - 1 ? grid[(y + 1) * G + x] : 0;
      const right = x < G - 1 ? grid[y * G + x + 1] : 0;
      if (up !== v) {
        ctx.fillStyle = sw.lit;
        ctx.fillRect(px, py, n, edge);
      }
      if (down !== v || right !== v) {
        ctx.fillStyle = sw.dark;
        if (down !== v) ctx.fillRect(px, py + n - edge, n, edge);
        if (right !== v) ctx.fillRect(px + n - edge, py, edge, n);
      }
    }
  }
}

/** Paint only glowing cells at 1px per cell (bloom source, upscaled with smoothing). */
export function paintGlow(ctx: Ctx, grid: Uint8Array, boost: (idx: number) => number): void {
  ctx.clearRect(0, 0, G, G);
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i] ?? 0;
    const sw = SWATCHES[v];
    if (!sw || !sw.glow) continue;
    ctx.globalAlpha = Math.min(1, boost(v));
    ctx.fillStyle = sw.base;
    ctx.fillRect(i % G, Math.floor(i / G), 1, 1);
  }
  ctx.globalAlpha = 1;
}

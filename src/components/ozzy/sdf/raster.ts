/** Rasterize a rigged SDF part list into lit, quantized, outlined pixel art. Pure, no DOM. */
import { hexToRgb, MATERIALS, OUTLINE, type Material } from "./materials";
import type { Part } from "./model";
import { solveRig, type Pose } from "./rig";

export interface Frame {
  size: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Emissive pixels only (for bloom). */
  glow: Uint8ClampedArray<ArrayBuffer>;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const RAMPS = Object.fromEntries(
  Object.entries(MATERIALS).map(([k, v]) => [k, v.ramp.map(hexToRgb)]),
) as Record<Material, [number, number, number][]>;
const OUT = hexToRgb(OUTLINE);
// Key light top-left-front, bounce from bottom-right.
const L = norm3(-0.55, -0.65, 0.55);
const B = norm3(0.6, 0.7, 0.2);

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

export function rasterize(parts: readonly Part[], pose: Pose, size = 64): Frame {
  const inv = solveRig(pose);
  const sorted = [...parts].sort((a, b) => b.z - a.z || (a.id < b.id ? -1 : 1));
  const n = size * size;
  const owner = new Int16Array(n).fill(-1);
  const tone = new Float32Array(n);
  const k = 64 / size;

  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      const wx = (cx + 0.5) * k;
      const wy = (cy + 0.5) * k;
      for (let pi = 0; pi < sorted.length; pi++) {
        const p = sorted[pi];
        if (!p) continue;
        const m = inv[p.bone];
        const x = m[0] * wx + m[2] * wy + m[4];
        const y = m[1] * wx + m[3] * wy + m[5];
        if (x < p.box[0] || x > p.box[2] || y < p.box[1] || y > p.box[3]) continue;
        const d = p.sdf(x, y);
        if (d >= 0) continue;
        const i = cy * size + cx;
        owner[i] = pi;
        if (MATERIALS[p.mat].flat) break;
        const gx = p.sdf(x + 0.5, y) - p.sdf(x - 0.5, y);
        const gy = p.sdf(x, y + 0.5) - p.sdf(x, y - 0.5);
        const gl = Math.hypot(gx, gy) || 1;
        const h = Math.min(1, -d / (p.dome ?? 6));
        const dome = Math.sqrt(1 - (1 - h) * (1 - h));
        const s = Math.sqrt(Math.max(0, 1 - dome * dome));
        const nx = (gx / gl) * s;
        const ny = (gy / gl) * s;
        const nz = dome;
        const key = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const bounce = Math.max(0, nx * B[0] + ny * B[1] + nz * B[2]);
        tone[i] = 0.18 + key * 0.85 + bounce * 0.12;
        break;
      }
    }
  }

  const rgba = new Uint8ClampedArray(n * 4);
  const glow = new Uint8ClampedArray(n * 4);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? -1 : (owner[y * size + x] ?? -1));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o = owner[i] ?? -1;
      let c: readonly number[] | undefined;
      let emit = false;
      if (o < 0) {
        if (at(x - 1, y) >= 0 || at(x + 1, y) >= 0 || at(x, y - 1) >= 0 || at(x, y + 1) >= 0) c = OUT;
      } else {
        const p = sorted[o];
        if (!p) continue;
        const def = MATERIALS[p.mat];
        const ramp = RAMPS[p.mat];
        const last = ramp.length - 1;
        if (def.flat) c = ramp[0];
        else {
          const dith = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) / 16 - 0.5) * 0.5;
          let t = (1 - Math.min(1, tone[i] ?? 0)) * (last + 0.6) + dith;
          // Rim: cells on the silhouette facing away from the key light get a lift.
          if (at(x + 1, y) < 0 || at(x, y + 1) < 0) t -= 0.6;
          // Sel-out inner line where a line-flagged/higher part sits over a different material.
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
            const q = sorted[at(nx, ny)];
            if (q && q !== p && q.z > p.z && q.mat !== p.mat && q.line) t = last + 1;
          }
          c = ramp[Math.max(0, Math.min(last, Math.round(t)))];
        }
        emit = !!def.emissive;
      }
      if (!c) continue;
      const j = i * 4;
      rgba[j] = c[0] ?? 0;
      rgba[j + 1] = c[1] ?? 0;
      rgba[j + 2] = c[2] ?? 0;
      rgba[j + 3] = 255;
      if (emit) {
        glow[j] = c[0] ?? 0;
        glow[j + 1] = c[1] ?? 0;
        glow[j + 2] = c[2] ?? 0;
        glow[j + 3] = 255;
      }
    }
  }
  return { size, rgba, glow };
}

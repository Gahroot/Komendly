/** 2D signed distance primitives (negative inside). Pure math, no DOM. */
export type Vec = readonly [number, number];
export type Sdf = (x: number, y: number) => number;

export const circle = (cx: number, cy: number, r: number): Sdf => (x, y) => Math.hypot(x - cx, y - cy) - r;

/** Cheap ellipse approximation (good enough at pixel scale). */
export const ellipse =
  (cx: number, cy: number, rx: number, ry: number, rot = 0): Sdf =>
  (x, y) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const dx = x - cx;
    const dy = y - cy;
    const u = (dx * c + dy * s) / rx;
    const v = (-dx * s + dy * c) / ry;
    const k = Math.hypot(u, v);
    return (k - 1) * Math.min(rx, ry);
  };

/** Tapered capsule from a (radius ra) to b (radius rb). */
export const capsule =
  (a: Vec, b: Vec, ra: number, rb = ra): Sdf =>
  (x, y) => {
    const bx = b[0] - a[0];
    const by = b[1] - a[1];
    const px = x - a[0];
    const py = y - a[1];
    const h = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by)));
    return Math.hypot(px - bx * h, py - by * h) - (ra + (rb - ra) * h);
  };

/** Convex or concave polygon, optionally rounded by r. */
export const polygon =
  (pts: readonly Vec[], r = 0): Sdf =>
  (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const pi = pts[i];
      const pj = pts[j];
      if (!pi || !pj) continue;
      const ex = pj[0] - pi[0];
      const ey = pj[1] - pi[1];
      const wx = x - pi[0];
      const wy = y - pi[1];
      const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
      d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
      if (pi[1] > y !== pj[1] > y && x < (ex * (y - pi[1])) / ey + pi[0]) inside = !inside;
    }
    return (inside ? -d : d) - r;
  };

/** Arc stroke: ring of radius r, thickness t, kept where angle in [a0,a1] (radians, y down). */
export const arc =
  (cx: number, cy: number, r: number, t: number, a0: number, a1: number): Sdf =>
  (x, y) => {
    const a = Math.atan2(y - cy, x - cx);
    if (a >= a0 && a <= a1) return Math.abs(Math.hypot(x - cx, y - cy) - r) - t;
    const e0x = cx + Math.cos(a0) * r;
    const e0y = cy + Math.sin(a0) * r;
    const e1x = cx + Math.cos(a1) * r;
    const e1y = cy + Math.sin(a1) * r;
    return Math.min(Math.hypot(x - e0x, y - e0y), Math.hypot(x - e1x, y - e1y)) - t;
  };

export function starPoints(cx: number, cy: number, r: number, inner = 0.45, rot = 0): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

export const star = (cx: number, cy: number, r: number, rot = 0): Sdf => polygon(starPoints(cx, cy, r, 0.45, rot));

export const union =
  (...fs: Sdf[]): Sdf =>
  (x, y) => {
    let d = Infinity;
    for (const f of fs) d = Math.min(d, f(x, y));
    return d;
  };

export const subtract =
  (a: Sdf, b: Sdf): Sdf =>
  (x, y) =>
    Math.max(a(x, y), -b(x, y));

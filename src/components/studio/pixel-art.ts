// Deterministic pixel-art generators for the studio scene (server-safe, no randomness at render).

/** Small seeded PRNG so stars/fireflies are identical on server and client. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stepped ridge path on a W x H grid of `cell` px from integer heights. */
export function ridgePath(heights: number[], cell: number, h: number): string {
  let d = `M0 ${h}`;
  heights.forEach((v, i) => {
    const y = h - v * cell;
    d += ` L${i * cell} ${y} L${(i + 1) * cell} ${y}`;
  });
  return `${d} L${heights.length * cell} ${h} Z`;
}

/** Gentle procedural skyline heights. */
export function ridgeHeights(count: number, seed: number, base: number, amp: number): number[] {
  const r = seeded(seed);
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < count; i++) {
    v += Math.round((r() - 0.5) * 2.2);
    v = Math.max(base - amp, Math.min(base + amp, v));
    out.push(v);
  }
  return out;
}

/** Pixel moon cells (x,y,color) on an n x n grid. */
export function moonCells(n = 16): { x: number; y: number; c: string }[] {
  const cells: { x: number; y: number; c: string }[] = [];
  const r = n / 2 - 0.5;
  const craters = [[5, 6, 1.6], [10, 9, 1.2], [7, 11, 1]];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = x - r, dy = y - r;
      const d = Math.hypot(dx, dy);
      if (d > r + 0.3) continue;
      const lit = (dx + dy) / (2 * r);
      let c = lit < -0.35 ? "#fff8e6" : lit < 0.15 ? "#ffe2ad" : lit < 0.5 ? "#ffc982" : "#f0a860";
      if (craters.some(([cx, cy, cr]) => Math.hypot(x - cx, y - cy) < cr)) c = "#f2b878";
      cells.push({ x, y, c });
    }
  return cells;
}

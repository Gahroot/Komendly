// Van Westendorp price sensitivity meter. Pure: curves over the sorted unique price grid,
// intersections by linear interpolation between neighbouring grid points.

export interface VwResponse {
  tooCheap: number;
  cheap: number;
  expensive: number;
  tooExpensive: number;
}

export interface VwResult {
  count: number;
  /** Point of marginal cheapness: "too cheap" x "getting expensive". */
  pmc: number | null;
  /** Point of marginal expensiveness: "too expensive" x "bargain". */
  pme: number | null;
  /** Optimal price point: "too cheap" x "too expensive". */
  opp: number | null;
  /** Indifference price point: "bargain" x "getting expensive". */
  ipp: number | null;
}

type Curve = (p: number) => number;

function intersect(grid: readonly number[], f: Curve, g: Curve): number | null {
  let prevP: number | null = null;
  let prevD = 0;
  for (const p of grid) {
    const d = f(p) - g(p);
    if (d === 0) return p;
    if (prevP !== null && Math.sign(d) !== Math.sign(prevD)) {
      return prevP + ((p - prevP) * prevD) / (prevD - d);
    }
    prevP = p;
    prevD = d;
  }
  return null;
}

export function computeVanWestendorp(responses: readonly VwResponse[]): VwResult {
  const n = responses.length;
  if (n === 0) return { count: 0, pmc: null, pme: null, opp: null, ipp: null };
  const grid = [...new Set(responses.flatMap((r) => [r.tooCheap, r.cheap, r.expensive, r.tooExpensive]))].sort((a, b) => a - b);
  const share = (pred: (r: VwResponse) => boolean) => responses.filter(pred).length / n;
  const tooCheap: Curve = (p) => share((r) => r.tooCheap >= p);
  const cheap: Curve = (p) => share((r) => r.cheap >= p);
  const expensive: Curve = (p) => share((r) => r.expensive <= p);
  const tooExpensive: Curve = (p) => share((r) => r.tooExpensive <= p);
  return {
    count: n,
    pmc: intersect(grid, tooCheap, expensive),
    pme: intersect(grid, cheap, tooExpensive),
    opp: intersect(grid, tooCheap, tooExpensive),
    ipp: intersect(grid, cheap, expensive),
  };
}

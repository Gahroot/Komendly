import { describe, expect, it } from "vitest";
import { computeVanWestendorp } from "../van-westendorp";

describe("computeVanWestendorp", () => {
  it("returns nulls for no responses", () => {
    expect(computeVanWestendorp([])).toEqual({ count: 0, pmc: null, pme: null, opp: null, ipp: null });
  });

  it("finds exact intersections for identical answers", () => {
    const r = { tooCheap: 10, cheap: 30, expensive: 80, tooExpensive: 150 };
    const out = computeVanWestendorp([r, r, r]);
    expect(out.count).toBe(3);
    // all curves step at the answers; tooCheap drops to 0 after 10 while expensive is 0 until 80
    expect(out.opp).not.toBeNull();
    expect(out.ipp).not.toBeNull();
  });

  it("interpolates between grid points and orders the points sensibly", () => {
    const rs = Array.from({ length: 20 }, (_, i) => ({ tooCheap: 10 + i, cheap: 30 + 2 * i, expensive: 60 + 3 * i, tooExpensive: 100 + 5 * i }));
    const out = computeVanWestendorp(rs);
    expect(out.count).toBe(20);
    for (const v of [out.pmc, out.pme, out.opp, out.ipp]) expect(v).not.toBeNull();
    expect(out.pmc ?? 0).toBeLessThanOrEqual(out.pme ?? 0);
    expect(out.opp ?? 0).toBeGreaterThan(10);
    expect(out.pme ?? 0).toBeLessThan(200);
  });

  it("interpolates linearly for a two-person split", () => {
    const out = computeVanWestendorp([
      { tooCheap: 10, cheap: 20, expensive: 40, tooExpensive: 50 },
      { tooCheap: 20, cheap: 30, expensive: 50, tooExpensive: 60 },
    ]);
    // cheap: 20->1, 30->0.5, 40->0 ; expensive: 30->0, 40->0.5 : crossing at 35
    expect(out.ipp).toBeCloseTo(35);
  });
});

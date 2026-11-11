import { describe, expect, it } from "vitest";
import { crossing, parseSurveyAnswers, vanWestendorp, vanWestendorpCurves, type PriceSurveyAnswers } from "../price-survey";

const r = (tooCheap: number, bargain: number, expensive: number, tooExpensive: number): PriceSurveyAnswers => ({ tooCheap, bargain, expensive, tooExpensive });

describe("parseSurveyAnswers", () => {
  it("accepts ordered numbers (and numeric strings)", () => {
    expect(parseSurveyAnswers({ tooCheap: "20", bargain: 80, expensive: 200, tooExpensive: 400.4 })).toEqual({ ok: true, value: r(20, 80, 200, 400) });
  });
  it("rejects junk, negatives and out-of-order answers", () => {
    expect(parseSurveyAnswers(null).ok).toBe(false);
    expect(parseSurveyAnswers({ tooCheap: -1, bargain: 1, expensive: 2, tooExpensive: 3 }).ok).toBe(false);
    expect(parseSurveyAnswers({ tooCheap: 50, bargain: 10, expensive: 200, tooExpensive: 400 }).ok).toBe(false);
  });
});

describe("vanWestendorp", () => {
  it("is empty with no responses", () => {
    expect(vanWestendorp([])).toEqual({ n: 0, points: [], opp: null, ipp: null, pmc: null, pme: null });
  });

  it("builds cumulative curves (falling cheap curves, rising expensive curves)", () => {
    const pts = vanWestendorpCurves([r(10, 20, 30, 40), r(20, 30, 40, 50)]);
    const at = (p: number) => pts.find((x) => x.price === p);
    expect(at(20)).toMatchObject({ tooCheap: 0.5, cheap: 1, expensive: 0, tooExpensive: 0 });
    expect(at(40)).toMatchObject({ tooCheap: 0, cheap: 0, expensive: 1, tooExpensive: 0.5, notExpensive: 0 });
  });

  it("finds intersections in the expected order on a spread sample", () => {
    const rs = [r(20, 50, 100, 200), r(30, 80, 150, 300), r(50, 100, 200, 400), r(60, 120, 250, 500), r(80, 150, 300, 600)];
    const v = vanWestendorp(rs);
    expect(v.n).toBe(5);
    for (const k of ["pmc", "opp", "ipp", "pme"] as const) expect(v[k]).not.toBeNull();
    expect(v.pmc as number).toBeLessThanOrEqual(v.pme as number);
    expect(v.opp as number).toBeGreaterThan(50);
    expect(v.opp as number).toBeLessThan(200);
  });

  it("interpolates between grid points", () => {
    const pts = [
      { price: 0, tooCheap: 1, cheap: 0, expensive: 0, tooExpensive: 0, notCheap: 0, notExpensive: 1 },
      { price: 100, tooCheap: 0, cheap: 0, expensive: 0, tooExpensive: 1, notCheap: 0, notExpensive: 1 },
    ];
    expect(crossing(pts, "tooCheap", "tooExpensive")).toBe(50);
  });
});

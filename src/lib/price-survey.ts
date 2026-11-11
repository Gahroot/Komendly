// Van Westendorp price sensitivity survey for the testimonials product. Pure + client-safe.

import { PLAN_CONFIG } from "./stripe-config";

export const PRICE_SURVEY_EVENT = "testi_price_survey";
export const PRICE_SURVEY_STORAGE_KEY = "kmd_price_survey_done";
export const PRICE_SURVEY_VIDEOS = PLAN_CONFIG.starter.minutesPerMonth;
export const PRICE_SURVEY_SUBJECT = `${PRICE_SURVEY_VIDEOS} testimonial videos per month`;
export const PRICE_SURVEY_PLACEMENTS = ["pricing", "first_video_ready"] as const;
export type PriceSurveyPlacement = (typeof PRICE_SURVEY_PLACEMENTS)[number];

export interface PriceSurveyAnswers {
  tooCheap: number;
  bargain: number;
  expensive: number;
  tooExpensive: number;
}

export const PRICE_SURVEY_QUESTIONS: { key: keyof PriceSurveyAnswers; label: string }[] = [
  { key: "tooExpensive", label: "At what monthly price would it be so expensive you wouldn't consider it?" },
  { key: "expensive", label: "At what price would it start to feel expensive, but you'd still consider it?" },
  { key: "bargain", label: "At what price would it feel like a bargain, a great buy for the money?" },
  { key: "tooCheap", label: "At what price would it be so cheap you'd doubt the quality?" },
];

const MAX_PRICE = 100_000;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validate untrusted answers: whole dollars, 0..100k, and logically ordered (too cheap ≤ bargain ≤ expensive ≤ too expensive). */
export function parseSurveyAnswers(v: unknown): ParseResult<PriceSurveyAnswers> {
  if (typeof v !== "object" || v === null) return { ok: false, error: "Answers are required" };
  const o = v as Record<string, unknown>;
  const out: Partial<PriceSurveyAnswers> = {};
  for (const { key } of PRICE_SURVEY_QUESTIONS) {
    const n = typeof o[key] === "string" ? Number(o[key]) : o[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_PRICE) return { ok: false, error: `Invalid ${key}` };
    out[key] = Math.round(n);
  }
  const a = out as PriceSurveyAnswers;
  if (!(a.tooCheap <= a.bargain && a.bargain <= a.expensive && a.expensive <= a.tooExpensive)) {
    return { ok: false, error: "Prices should go up from 'too cheap' to 'too expensive'" };
  }
  return { ok: true, value: a };
}

export interface CurvePoint {
  price: number;
  tooCheap: number;
  cheap: number;
  expensive: number;
  tooExpensive: number;
  notCheap: number;
  notExpensive: number;
}

export interface VanWestendorpResult {
  n: number;
  points: CurvePoint[];
  /** Optimal price point: too cheap × too expensive. */
  opp: number | null;
  /** Indifference price point: cheap × expensive. */
  ipp: number | null;
  /** Point of marginal cheapness: too cheap × not cheap. */
  pmc: number | null;
  /** Point of marginal expensiveness: too expensive × not expensive. */
  pme: number | null;
}

/** Share (0..1) of respondents for each cumulative curve at every answered price. */
export function vanWestendorpCurves(rs: readonly PriceSurveyAnswers[]): CurvePoint[] {
  const n = rs.length;
  if (n === 0) return [];
  const prices = [...new Set(rs.flatMap((r) => [r.tooCheap, r.bargain, r.expensive, r.tooExpensive]))].sort((a, b) => a - b);
  return prices.map((price) => {
    const share = (f: (r: PriceSurveyAnswers) => boolean) => rs.filter(f).length / n;
    const cheap = share((r) => r.bargain >= price);
    const expensive = share((r) => r.expensive <= price);
    return {
      price,
      tooCheap: share((r) => r.tooCheap >= price),
      cheap,
      expensive,
      tooExpensive: share((r) => r.tooExpensive <= price),
      notCheap: 1 - cheap,
      notExpensive: 1 - expensive,
    };
  });
}

/** First price where the falling curve `a` meets the rising curve `b`, linearly interpolated. */
export function crossing(points: readonly CurvePoint[], a: keyof CurvePoint, b: keyof CurvePoint): number | null {
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p) continue;
    const d = p[a] - p[b];
    if (d === 0) return p.price;
    const q = points[i + 1];
    if (!q) break;
    const e = q[a] - q[b];
    if (d > 0 && e < 0) return Math.round((p.price + (d / (d - e)) * (q.price - p.price)) * 100) / 100;
  }
  return null;
}

export function vanWestendorp(rs: readonly PriceSurveyAnswers[]): VanWestendorpResult {
  const points = vanWestendorpCurves(rs);
  return {
    n: rs.length,
    points,
    opp: crossing(points, "tooCheap", "tooExpensive"),
    ipp: crossing(points, "cheap", "expensive"),
    pmc: crossing(points, "tooCheap", "notCheap"),
    pme: crossing(points, "notExpensive", "tooExpensive"),
  };
}

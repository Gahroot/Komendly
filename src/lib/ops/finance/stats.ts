// Robust statistics for cost anomaly detection. Pure.
export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
}
export function mad(xs: readonly number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

export type Spike = { spike: boolean; value: number; baseline: number; z: number | null; reason: string };
export const SPIKE_MIN_HISTORY = 5;
export const SPIKE_Z = 3.5;
export const SPIKE_MIN_CENTS = 500;

/** Is `value` (latest day) an anomaly vs prior days? Modified z-score (median/MAD), with a floor on the scale so flat
 *  histories don't flag tiny moves. Needs >= 5 prior days, >= 2x the median and >= $5 to flag. */
export function detectSpike(history: readonly number[], value: number): Spike {
  if (history.length < SPIKE_MIN_HISTORY) return { spike: false, value, baseline: median(history), z: null, reason: "not enough history" };
  const base = median(history);
  const scale = Math.max(mad(history) / 0.6745, base * 0.1, 1);
  const z = (value - base) / scale;
  const spike = z >= SPIKE_Z && value >= base * 2 && value >= SPIKE_MIN_CENTS;
  return { spike, value, baseline: base, z: Math.round(z * 10) / 10, reason: spike ? `day cost ${value}c vs typical ${Math.round(base)}c` : "within normal range" };
}

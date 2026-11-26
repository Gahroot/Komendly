// Industry benchmark pages (/reports/local-service-meta-ads/benchmarks[/<trade>]): ONLY numbers already computed in the
// Ad Library snapshot (adlib-report-data.json). Nothing is invented; groups under MIN_GROUP advertisers get no page.
import { MIN_GROUP, type AdlibReport, type TradeRow } from "../adlib-report";

export const BENCHMARKS_BASE = "/reports/local-service-meta-ads/benchmarks";
export const benchmarkPath = (slug: string) => `${BENCHMARKS_BASE}/${slug}`;
export const benchmarkTrades = (r: AdlibReport): TradeRow[] => r.byTrade.filter((t) => t.advertisers >= MIN_GROUP);

export interface Delta { value: number; overall: number; diff: number; direction: "higher" | "lower" | "same" }
const delta = (value: number, overall: number): Delta => ({ value, overall, diff: Math.round((value - overall) * 10) / 10, direction: value > overall ? "higher" : value < overall ? "lower" : "same" });

export interface TradeBenchmark { trade: TradeRow; rank: { byAdvertisers: number; byMedianDays: number; of: number }; medianDays: Delta; liveAds: Delta; over365: Delta; offer: Delta }
export function tradeBenchmark(r: AdlibReport, slug: string): TradeBenchmark | null {
  const all = benchmarkTrades(r);
  const t = all.find((x) => x.slug === slug);
  if (!t) return null;
  const rank = (key: "advertisers" | "medianDays") => 1 + all.filter((x) => x[key] > t[key]).length;
  return { trade: t, rank: { byAdvertisers: rank("advertisers"), byMedianDays: rank("medianDays"), of: all.length }, medianDays: delta(t.medianDays, r.runDays.median), liveAds: delta(t.medianLiveAds, r.liveAds.median), over365: delta(t.over365Share, r.runDays.over365Share), offer: delta(t.offerShare, r.signals.offerShare) };
}
export const describeDelta = (d: Delta, unit: string) => d.direction === "same" ? `the same as all trades (${d.overall}${unit})` : `${Math.abs(d.diff)}${unit} ${d.direction} than the all-trade figure (${d.overall}${unit})`;

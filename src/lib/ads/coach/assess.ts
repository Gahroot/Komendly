// Deterministic part of the verdict: who has enough data, who is the winner, how long to wait.
// The model writes the plain-words reasons on top; these numbers and choices are not left to it. Pure.
import { DATA_FLOOR, type CoachVerdict } from "./contracts";
import type { AdMetrics } from "./table";

export interface AdAssessment {
  name: string;
  enoughData: boolean;
  /** Suggested verdict before the model words it. */
  verdict: "keep" | "kill" | "watch";
  keyNumber: string;
  /** Higher = better (comparable across ads of one report). */
  score: number | null;
}

export interface Assessment {
  ads: AdAssessment[];
  enoughData: boolean;
  waitDays: number | null;
  winner: string | null;
  basis: "roas" | "cost_per_result" | "ctr" | "none";
  confidence: CoachVerdict["confidence"];
}

export function hasEnoughData(a: Pick<AdMetrics, "impressions" | "spend">): boolean {
  return a.impressions >= DATA_FLOOR.impressions && a.spend >= DATA_FLOOR.spend;
}

function money(n: number, currency: string | null): string {
  const sym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency && currency !== "USD" ? `${currency} ` : "$";
  return `${sym}${n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2)}`;
}

/** Days until the slowest ad reaches the data floor at its current pace (1..14), or 3 when the pace is unknown. */
export function waitDaysFor(ads: AdMetrics[]): number {
  const short = ads.filter((a) => !hasEnoughData(a));
  let worst = 0;
  for (const a of short) {
    if (!a.days || a.days <= 0) return 3;
    const perDayImpr = a.impressions / a.days;
    const perDaySpend = a.spend / a.days;
    const need = Math.max(
      perDayImpr > 0 ? (DATA_FLOOR.impressions - a.impressions) / perDayImpr : 14,
      perDaySpend > 0 ? (DATA_FLOOR.spend - a.spend) / perDaySpend : 14,
    );
    worst = Math.max(worst, need);
  }
  return Math.min(14, Math.max(1, Math.ceil(worst)));
}

export function assessReport(ads: AdMetrics[], currency: string | null): Assessment {
  const judged = ads.filter(hasEnoughData);
  const withRoas = judged.filter((a) => a.roas !== null && a.roas > 0);
  const withCpr = judged.filter((a) => a.results !== null && a.results > 0 && a.costPerResult !== null);
  const withCtr = judged.filter((a) => a.ctr !== null);
  const basis: Assessment["basis"] =
    withRoas.length >= Math.max(1, Math.ceil(judged.length / 2)) ? "roas" : withCpr.length >= 1 ? "cost_per_result" : withCtr.length >= 1 ? "ctr" : "none";
  const scoreOf = (a: AdMetrics): number | null => {
    if (basis === "roas") return a.roas ?? 0;
    if (basis === "cost_per_result") return a.results && a.results > 0 && a.costPerResult ? -a.costPerResult : null; // spent with 0 results scores worst
    if (basis === "ctr") return a.ctr;
    return null;
  };
  const scored = judged.map((a) => ({ a, s: scoreOf(a) }));
  const ranked = scored.filter((x): x is { a: AdMetrics; s: number } => x.s !== null).sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name));
  const best = ranked[0];
  const median = ranked.length ? (ranked[Math.floor((ranked.length - 1) / 2)]?.s ?? 0) : 0;

  const out: AdAssessment[] = ads.map((a) => {
    const enough = hasEnoughData(a);
    const s = enough ? scoreOf(a) : null;
    const keyNumber = !enough
      ? `${a.impressions.toLocaleString("en-US")} views, ${money(a.spend, currency)} spent`
      : basis === "roas"
        ? `${(a.roas ?? 0).toFixed(1)}x return`
        : basis === "cost_per_result"
          ? a.results && a.costPerResult
            ? `${money(a.costPerResult, currency)} per result`
            : `0 results for ${money(a.spend, currency)}`
          : basis === "ctr" && a.ctr !== null
            ? `${a.ctr.toFixed(2)}% click rate`
            : `${money(a.spend, currency)} spent`;
    let verdict: AdAssessment["verdict"] = "watch";
    if (enough) {
      if (best && a.name === best.a.name) verdict = "keep";
      else if (basis === "cost_per_result" && s === null) verdict = "kill"; // real money, zero results
      else if (s !== null && best && ranked.length >= 2) {
        if (basis === "roas") verdict = s >= Math.max(1, best.s * 0.6) ? "keep" : s < 1 ? "kill" : "watch";
        else if (basis === "cost_per_result") verdict = -s <= -best.s * 1.5 ? "keep" : -s >= -best.s * 2.5 ? "kill" : "watch";
        else verdict = s >= median ? "watch" : "kill";
      }
    }
    return { name: a.name, enoughData: enough, verdict, keyNumber, score: s };
  });
  const enoughData = judged.length > 0;
  const winner = best && (ranked.length >= 2 || judged.length === 1) && basis !== "none" ? best.a.name : null;
  const confidence: Assessment["confidence"] =
    !enoughData || basis === "none" ? "low" : judged.length >= 3 && basis !== "ctr" && judged.length === ads.length ? "high" : "medium";
  return { ads: out, enoughData, waitDays: judged.length < ads.length ? waitDaysFor(ads) : null, winner, basis, confidence };
}

/**
 * Force the model's wording onto the deterministic skeleton: same ads, same verdicts, key numbers,
 * winner name, data flags. The model only contributes summary/reasons/actions/winner style.
 */
export function finalizeVerdict(model: CoachVerdict, a: Assessment): CoachVerdict {
  const reasons = new Map(model.ads.map((x) => [x.name.trim().toLowerCase(), x.reason]));
  const ads = a.ads.map((x) => ({
    name: x.name.slice(0, 200),
    verdict: x.verdict,
    reason: (reasons.get(x.name.trim().toLowerCase()) ?? (x.enoughData ? "Compared with your other ads." : "Not enough data yet to judge.")).slice(0, 240),
    keyNumber: x.keyNumber.slice(0, 80),
  }));
  const winner = a.winner && model.winner ? { ...model.winner, name: a.winner.slice(0, 200) } : null;
  const actions = model.actions.slice(0, 3);
  if (!a.enoughData && !actions.some((x) => x.kind === "wait")) {
    actions.unshift({ kind: "wait", text: `Leave the ads running about ${a.waitDays ?? 3} more days before changing anything.` });
  }
  return {
    ...model,
    ads,
    actions: actions.slice(0, 3),
    winner,
    enoughData: a.enoughData,
    waitDays: a.enoughData && a.waitDays === null ? null : (a.waitDays ?? (a.enoughData ? null : 3)),
    confidence: a.confidence === "low" || model.confidence === "low" ? "low" : a.confidence,
  };
}

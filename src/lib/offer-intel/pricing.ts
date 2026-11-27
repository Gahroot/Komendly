// Pricing / packaging analysis. READ-ONLY intelligence: it never changes a price. For each money model it computes
// first-30-day gross profit vs CAC (30-day payback) and a 12-month LTGP:CAC from real economics when present,
// otherwise from stated assumptions (always labelled). Owner decisions go to the "needs you" list with the math.
import type { Economics } from "../revenue/economics";

export interface PricingInputs {
  cacCents: number; grossMargin: number; monthlyChurn: number;
  /** Share of people who see the offer that take the FIRST payment, per model. Assumed unless measured. */
  assumedTakeRate: Record<string, number>;
  source: "measured" | "assumed";
  notes: string[];
}
export interface MoneyModel {
  key: string; name: string;
  firstPaymentCents: number; monthlyAfterCents: number; months: number; prepaidCents?: number;
  /** Extra variable cost in month 1 (e.g. onboarding labour) in cents. */
  extraCostCents?: number;
}
export interface ModelResult {
  key: string; name: string; payback30: number; ltgpToCac12: number; cash30Cents: number; takeRate: number; promising: boolean; why: string; uncertainty: string;
}

export const DEFAULT_MODELS: readonly MoneyModel[] = [
  { key: "attraction_9", name: "$9 attraction then $297/mo", firstPaymentCents: 900, monthlyAfterCents: 29700, months: 12 },
  { key: "first_month_97", name: "$97 first month then $297/mo (live)", firstPaymentCents: 9700, monthlyAfterCents: 29700, months: 12 },
  { key: "plain_197", name: "$197/mo flat", firstPaymentCents: 19700, monthlyAfterCents: 19700, months: 12 },
  { key: "plain_297", name: "$297/mo flat", firstPaymentCents: 29700, monthlyAfterCents: 29700, months: 12 },
  { key: "annual_prepay", name: "Annual prepay, 2 months free ($2,970)", firstPaymentCents: 297000, monthlyAfterCents: 0, months: 12, prepaidCents: 297000 },
  { key: "paid_trial_money_back", name: "Paid trial, 'win your money back' ($97, refunded if ads aren't live)", firstPaymentCents: 9700, monthlyAfterCents: 29700, months: 12, extraCostCents: 1500 },
  { key: "dwy_tier", name: "Done-with-you tier ($497/mo, call-based onboarding)", firstPaymentCents: 49700, monthlyAfterCents: 49700, months: 12, extraCostCents: 6000 },
];

/** Real economics when they carry a CAC, otherwise stated assumptions. */
export function inputsFromEconomics(e: Economics | null, fallbackCacCents = 15000): PricingInputs {
  const cac = e?.cacCents?.cents ?? null;
  const churn = e?.monthlyChurn?.value ?? null;
  const measuredChurn = e && e.monthlyChurn.confidence === "measured" && churn !== null;
  const measuredCac = e && e.cacCents.confidence === "measured" && cac !== null;
  const notes: string[] = [];
  if (!measuredCac) notes.push(`CAC ${cac !== null ? "is a small-sample estimate" : "is assumed"} at ${(((cac ?? fallbackCacCents)) / 100).toFixed(0)} dollars`);
  if (!measuredChurn) notes.push("monthly churn is assumed at 10% until 10+ subscribers have 90 days of history");
  notes.push("take rates per model are assumptions, not measurements: only the live $97 offer has any data, and it is thin");
  return {
    cacCents: cac ?? fallbackCacCents, grossMargin: e?.firstPurchaseMarginCents ? 0.7 : 0.7, monthlyChurn: measuredChurn ? (churn as number) : 0.1,
    assumedTakeRate: { attraction_9: 0.06, first_month_97: 0.03, plain_197: 0.012, plain_297: 0.008, annual_prepay: 0.004, paid_trial_money_back: 0.035, dwy_tier: 0.004 },
    source: measuredCac && measuredChurn ? "measured" : "assumed", notes,
  };
}

export function analyseModel(m: MoneyModel, i: PricingInputs): ModelResult {
  const gm = i.grossMargin;
  const first = m.prepaidCents ?? m.firstPaymentCents;
  const gp30 = first * gm - (m.extraCostCents ?? 0);
  let ltgp = gp30;
  if (!m.prepaidCents) {
    let alive = 1 - i.monthlyChurn; // survive past month 1
    for (let k = 2; k <= m.months; k++) { ltgp += alive * m.monthlyAfterCents * gm; alive *= 1 - i.monthlyChurn; }
  } else ltgp = m.prepaidCents * gm - (m.extraCostCents ?? 0); // prepaid: cash up front, refund risk ignored
  const takeRate = i.assumedTakeRate[m.key] ?? 0.01;
  // CAC per paying customer = cost per visitor-who-sees-the-offer / take rate; normalised to the live model's take rate.
  const base = i.assumedTakeRate.first_month_97 ?? 0.03;
  const cacPerCustomer = i.cacCents * (base / takeRate);
  const payback30 = cacPerCustomer > 0 ? gp30 / cacPerCustomer : 0;
  const ltgpToCac12 = cacPerCustomer > 0 ? ltgp / cacPerCustomer : 0;
  const promising = payback30 >= 1 || ltgpToCac12 >= 3;
  return {
    key: m.key, name: m.name, payback30: round(payback30), ltgpToCac12: round(ltgpToCac12), cash30Cents: Math.round(first), takeRate, promising,
    why: `30-day gross profit ${(gp30 / 100).toFixed(0)} dollars vs about ${(cacPerCustomer / 100).toFixed(0)} dollars to win a customer; 12-month gross profit ${(ltgp / 100).toFixed(0)} dollars.`,
    uncertainty: m.key === "first_month_97" ? "Only model with real traffic behind it, still a small sample." : "The take rate for this model is an assumption; test it with an experiment before any decision.",
  };
}
const round = (n: number) => Math.round(n * 100) / 100;

export function analysePricing(e: Economics | null, models: readonly MoneyModel[] = DEFAULT_MODELS) {
  const inputs = inputsFromEconomics(e);
  const results = models.map((m) => analyseModel(m, inputs));
  const live = results.find((r) => r.key === "first_month_97");
  const better = results.filter((r) => r.key !== "first_month_97" && live && (r.payback30 > live.payback30 * 1.25 || r.ltgpToCac12 > live.ltgpToCac12 * 1.25));
  const decisions = better.map((r) => ({
    title: `Consider testing: ${r.name}`,
    body: `${r.why} Live offer: payback ${live!.payback30}x, 12-month LTGP:CAC ${live!.ltgpToCac12}. This one: payback ${r.payback30}x, ${r.ltgpToCac12}. ${r.uncertainty} Inputs are ${inputs.source}; ${inputs.notes.join("; ")}. Nothing changes until you decide.`,
  }));
  return { inputs, results, decisions };
}

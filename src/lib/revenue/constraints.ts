// Constraint diagnosis (Hormozi: find the ONE step where the most potential customers are lost vs a benchmark, fix only
// that, re-measure) and an honest business stage (Acquisition.com Scaling Roadmap, early stages). Pure TS, no I/O.
// Benchmarks are ASSUMPTIONS (typical for free-to-paid self-serve), not Komendly data: replace with measured ones as they appear.
// Small samples are shrunk toward the benchmark (prior strength PRIOR_N) so 0/12 never looks like a proven disaster.
import type { Confidence, Economics } from "./economics";

export type ConstraintKey = "traffic" | "activation" | "first_purchase" | "upsell" | "delivery" | "retention" | "economics";
export type Constraint = { key: ConstraintKey; label: string; rank: number; severity: number; observed: number | null; benchmark: number; n: number; confidence: Confidence; evidence: string; action: string };
export type FunnelFacts = Pick<Economics, "funnel" | "rates" | "payback30" | "ltgpToCac" | "windowDays" | "payingCustomers">;

export const BENCHMARKS = { visitToSignup: 0.03, activation: 0.6, firstPurchase: 0.05, upsell: 0.1, delivery: 0.9, retention30: 0.7, ltgpToCac: 3, payback30: 1, visitorsPerDay: 150 } as const;
const PRIOR_N = 10;
const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** Shrunk rate and "how many times better the funnel would be if this step hit its benchmark" (>= 1). */
export function severityOf(successes: number, n: number, benchmark: number): { shrunk: number; severity: number } {
  const shrunk = (successes + PRIOR_N * benchmark) / (n + PRIOR_N);
  return { shrunk, severity: Math.round(Math.max(1, benchmark / Math.max(shrunk, 0.001)) * 100) / 100 };
}

export function diagnoseConstraint(f: FunnelFacts): Constraint[] {
  const out: Omit<Constraint, "rank">[] = [];
  const step = (key: ConstraintKey, label: string, successes: number, n: number, bench: number, evidence: string, action: string) => {
    const { severity } = severityOf(successes, n, bench);
    out.push({ key, label, severity, observed: n ? successes / n : null, benchmark: bench, n, confidence: n < 5 ? "insufficient" : n < 30 ? "estimated" : "measured", evidence, action });
  };
  const fu = f.funnel;
  const perDay = fu.visitors / Math.max(1, f.windowDays);
  const t = severityOf(Math.round(perDay * 10), 10, BENCHMARKS.visitorsPerDay / 10);
  out.push({ key: "traffic", label: "Traffic / sign-ups", severity: Math.min(t.severity, 5), observed: perDay, benchmark: BENCHMARKS.visitorsPerDay, n: fu.visitors, confidence: fu.visitors < 30 ? "estimated" : "measured",
    evidence: `${fu.visitors} visits in ${f.windowDays}d (${perDay.toFixed(1)}/day, target ${BENCHMARKS.visitorsPerDay}/day) and ${fu.signups} sign-ups (${pct(f.rates.visitToSignup.value)} of visits, benchmark ${pct(BENCHMARKS.visitToSignup)}).`,
    action: "Add or scale one lead getter (Core Four: more of what works, better creative, then a new channel); keep tracking first touch." });
  step("activation", "Activation (finish the free pack)", fu.activated, fu.signups, BENCHMARKS.activation, `${fu.activated}/${fu.signups} sign-ups finished a pack (${pct(f.rates.signupToActivated.value)}, benchmark ${pct(BENCHMARKS.activation)}).`, "Cut time-to-first-ad: fewer inputs, faster first render, nudge within the hour.");
  step("first_purchase", "First purchase ($9 unlock)", fu.firstPurchases, fu.activated, BENCHMARKS.firstPurchase, `${fu.firstPurchases}/${fu.activated} activated users bought (${pct(f.rates.activatedToPurchase.value)}, benchmark ${pct(BENCHMARKS.firstPurchase)}).`, "Test the offer, not the price first: value-equation levers (likelihood, speed, effort), bonuses, guarantee wording.");
  step("upsell", "Upsell (after the $9)", fu.upsellBought, fu.upsellShown, BENCHMARKS.upsell, `${fu.upsellBought}/${fu.upsellShown} who saw the upsell took it (${pct(f.rates.upsellShownToBought.value)}, benchmark ${pct(BENCHMARKS.upsell)}).`, "Make the upsell the logical next step of what they just bought; test one change at a time.");
  step("delivery", "Delivery / connection (free pack completes)", fu.deliveryDone, fu.deliveryTotal, BENCHMARKS.delivery, `${fu.deliveryDone}/${fu.deliveryTotal} sign-ups got a finished pack (${pct(fu.deliveryTotal ? fu.deliveryDone / fu.deliveryTotal : null)}, benchmark ${pct(BENCHMARKS.delivery)}); Meta connection failures are not yet counted here.`, "Read failed AdRun errors and Meta connect drop-offs; fix the most common cause first.");
  step("retention", "Retention (day 30)", fu.day30Retained, fu.day30Eligible, BENCHMARKS.retention30, `${fu.day30Retained}/${fu.day30Eligible} subscribers old enough are still active (${pct(f.rates.day30Retention.value)}, benchmark ${pct(BENCHMARKS.retention30)}).`, "Interview/save cancellers; deliver the first win inside 7 days.");
  const ec = f.ltgpToCac.ratio, pb = f.payback30.ratio;
  const ecoN = Math.min(f.payback30.n, f.payingCustomers);
  const ecoSev = ec !== null || pb !== null ? Math.max(ec !== null ? BENCHMARKS.ltgpToCac / Math.max(ec, 0.01) : 1, pb !== null ? BENCHMARKS.payback30 / Math.max(pb, 0.01) : 1, 1) : 1;
  out.push({ key: "economics", label: "Unit economics (30-day payback, LTGP:CAC)", severity: Math.round(Math.min(ecoSev, 5) * 100) / 100, observed: ec, benchmark: BENCHMARKS.ltgpToCac, n: ecoN, confidence: ec === null && pb === null ? "insufficient" : f.ltgpToCac.confidence === "measured" ? "measured" : "estimated",
    evidence: ec === null && pb === null ? "No customer cost/profit data yet: cannot judge." : `30-day payback ${pb ?? "n/a"}x (target >= 1), LTGP:CAC ${ec ?? "n/a"} (target >= 3).`, action: "Raise first-month cash (upsell/bundle) or cut cost to acquire before scaling spend." });
  // Weak evidence must not outrank solid evidence: insufficient-data steps sort after anything with data at equal severity.
  const weight = (c: Omit<Constraint, "rank">) => c.severity * (c.confidence === "insufficient" ? 0.5 : c.confidence === "estimated" ? 0.9 : 1);
  return out.sort((a, b) => weight(b) - weight(a)).map((c, i) => ({ ...c, rank: i + 1 }));
}

// ---------- business stage ----------
export type StageEvidence = { payingCustomers: number; totalRevenueCents: number; mrrCents: number; recurringCustomers: number; newPayingLast30d: number; weeksWithNewCustomersLast8: number; teamSize?: number };
export type BusinessStage = { index: number; code: string; label: string; roadmap: string; why: string[]; notYet: string[]; nextMilestone: string };

/**
 * Early Scaling Roadmap stages (acquisition.com/training/scalingstart): 0 Improvise ("nothing is happening yet"),
 * 1 Monetize ("doesn't make money yet"), 2 Advertise ("new customers aren't consistent"), 3 Stabilize ("workload exceeds resources").
 * Thresholds are our own heuristics for those descriptions.
 */
export function businessStage(e: StageEvidence): BusinessStage {
  if (e.totalRevenueCents <= 0) return { index: 0, code: "improvise", label: "Pre-revenue: find first customers", roadmap: "Stage 0 · Improvise", why: ["No real revenue recorded (internal/test accounts excluded)."], notYet: ["Do not scale ad spend, hire, or build new products.", "Do not optimise pricing: nobody has paid."], nextMilestone: "First paying customer from a stranger." };
  const repeatable = e.payingCustomers >= 10 && e.recurringCustomers >= 3;
  if (!repeatable) return {
    index: 1, code: "monetize", label: "First revenue: prove people will pay, repeatably", roadmap: "Stage 1 · Monetize",
    why: [`${e.payingCustomers} paying customer${e.payingCustomers === 1 ? "" : "s"} and $${(e.totalRevenueCents / 100).toFixed(0)} lifetime revenue; ${e.recurringCustomers} on a recurring plan.`, "Below 10 paying customers with 3+ recurring, the business is still proving the offer sells (statistics on this volume are very noisy)."],
    notYet: ["Do not scale paid spend beyond what one customer's first month repays.", "Do not build new products or channels: improve the ladder step with the biggest drop.", "Do not call any A/B result a win before the sample rule is met.", "Do not hire or automate delivery of an offer that has not sold."],
    nextMilestone: "10 paying customers, 3+ on the recurring plan, with new customers in 4 of the last 8 weeks.",
  };
  if (e.weeksWithNewCustomersLast8 < 6 || e.mrrCents < 1_000_000) return { index: 2, code: "advertise", label: "Consistent customers: make acquisition predictable", roadmap: "Stage 2 · Advertise", why: [`${e.payingCustomers} paying customers, MRR $${(e.mrrCents / 100).toFixed(0)}; new customers in ${e.weeksWithNewCustomersLast8} of the last 8 weeks.`], notYet: ["Do not add headcount before new-customer flow is steady."], nextMilestone: "New customers in 6+ of 8 weeks and MRR over $10k." };
  return { index: 3, code: "stabilize", label: "Stable demand: workload is the limit", roadmap: "Stage 3 · Stabilize", why: ["Customer flow is consistent and revenue supports a first hire."], notYet: ["Do not skip documenting delivery before training a hire."], nextMilestone: "First employees trained on delivery." };
}

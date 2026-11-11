// Website2ads pricing simulation (pricing v3). Run: npx tsx scripts/ads-pricing-sim.ts [--json] [--chart out.png]
// Deterministic: seeded PRNG, fixed cost snapshot. Two parts:
// 1. Cost per credit at OpenAI API list prices (no Codex subscription), from real dev-DB runs.
// 2. Van Westendorp + Gabor-Granger on a synthetic Monte Carlo respondent panel (5 buyer segments
//    anchored on cited 2026 prices; see goal-folder PRICING.md), then plan/pack prices that keep >= 70%
//    gross margin at the p90 API cost with every credit used.
import { writeFileSync } from "node:fs";
import { computeVanWestendorp, type VwResponse, type VwResult } from "../src/lib/ads/van-westendorp";
import { ADS_PLANS, ADS_TOPUPS } from "../src/lib/ads/billing-config";
import { CREDIT_COST, TRIAL_GRANT } from "../src/lib/ads/contracts";

// ---------- 1. Cost model ----------
// Snapshot of completed composed-renderer runs in the dev DB (AdJob.costMicros grouped by run, 2026-11-07),
// re-priced from the old meter (medium image $0.042, no input tokens) to list prices: per image call
// $0.053 output + $0.0075 prompt + 4 reference images x $0.016 = $0.1245 (engine/src/providers/cost.ts).
// Columns: [extract+plan micros per run (shared), static micros per ready ad-size incl. QC retries,
//           replacements and vision QC, animated ad micros incl. plates + QC].
const RUNS: ReadonlyArray<readonly [number, number, number]> = [
  [134360, 156496, 15626],
  [150302, 197902, 15858],
  [78130, 105629, 27174],
  [148522, 83350, 17320],
  [74654, 275799, 13472],
  [85944, 275686, 15248],
  [137732, 318776, 16672],
  [68886, 229751, 23828],
  [87870, 381989, 15718],
  [119424, 210830, 158972],
  [110262, 246512, 15278],
  [113040, 291799, 14686],
  [128748, 153396, 16914],
  [107558, 367348, 154524],
  [75676, 329354, 15280],
  [91824, 302821, 34564],
  [124670, 509879, 143634],
  [67364, 380235, 13616],
  [123556, 318834, 145888],
  [74750, 370871, 14744],
  [65732, 179834, 145408],
  [92112, 512142, 14236],
  [132758, 534594, 145908],
  [109508, 546831, 146702],
  [118688, 611357, 271652],
  [97384, 180001, 147028],
  [62160, 179325, 145920],
  [75572, 271711, 14114],
  [102118, 194071, 146540],
  [116748, 237714, 146694],
  [98346, 194946, 565592],
  [84396, 275483, 15084],
  [68252, 234404, 13986],
  [104118, 179663, 146300],
  [93330, 194220, 146558],
  [93090, 153431, 146792],
  [72474, 428751, 14494],
  [100844, 218792, 278922],
  [49932, 205201, 269142],
  [67194, 375811, 13994],
  [112914, 541974, 33696],
  [103324, 232752, 278480],
  [81992, 235088, 146706],
  [89790, 272138, 147632],
  [83584, 217361, 146274],
  [89810, 329127, 147048]
];
/** One animated ad if every scene plate is metered: 3 medium 9:16 plates (2 refs each) + vision QC. */
const MOTION_FLOOR_P90 = 3 * (0.053 + 0.0075 + 2 * 0.016) + 0.012;
const RAILWAY_PER_STATIC = 0.01; // rough share of the Railway engine box per ad-size render (~60 s CPU)
const RAILWAY_PER_MOTION = 0.05; // HTML->video render is ~5x a static
const STRIPE_PCT = 0.029;
const STRIPE_FIXED = 0.3;
const TARGET_MARGIN = 0.7;

function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return (s[lo] ?? 0) + ((s[hi] ?? 0) - (s[lo] ?? 0)) * (i - lo);
}

const trialCredits = TRIAL_GRANT.static * CREDIT_COST.staticPerRatio + TRIAL_GRANT.motion * CREDIT_COST.motion;
const paidRunCredits = 10 * 3 * CREDIT_COST.staticPerRatio + CREDIT_COST.motion; // 10 statics x 3 sizes + 1 animated
const usd = (m: number) => m / 1e6;
const perRun = RUNS.map(([shared, st, mo]) => ({
  staticOne: usd(st) + usd(shared) / trialCredits + RAILWAY_PER_STATIC,
  staticThree: 3 * (usd(st) + usd(shared) / paidRunCredits + RAILWAY_PER_STATIC),
  motion: usd(mo) + (usd(shared) / trialCredits) * CREDIT_COST.motion + RAILWAY_PER_MOTION,
  trial: TRIAL_GRANT.static * usd(st) + TRIAL_GRANT.motion * usd(mo) + usd(shared) + TRIAL_GRANT.static * RAILWAY_PER_STATIC + RAILWAY_PER_MOTION,
}));
const pick = (k: keyof (typeof perRun)[number], q: number) => quantile(perRun.map((r) => r[k]), q);
const motionP90 = Math.max(pick("motion", 0.9), MOTION_FLOOR_P90 + RAILWAY_PER_MOTION);
export const COST = {
  runs: RUNS.length,
  staticOne: { p50: pick("staticOne", 0.5), p90: pick("staticOne", 0.9) },
  staticThreePerAd: { p50: pick("staticThree", 0.5), p90: pick("staticThree", 0.9) },
  motionPerAd: { p50: pick("motion", 0.5), p90: motionP90 },
  trial: { p50: pick("trial", 0.5), p90: pick("trial", 0.9) + (motionP90 - pick("motion", 0.9)) },
};
const perCredit = {
  staticOne: { p50: COST.staticOne.p50, p90: COST.staticOne.p90 },
  staticThree: { p50: COST.staticThreePerAd.p50 / 3, p90: COST.staticThreePerAd.p90 / 3 },
  motion: { p50: COST.motionPerAd.p50 / CREDIT_COST.motion, p90: COST.motionPerAd.p90 / CREDIT_COST.motion },
};
/** Worst case: a customer spends every credit on the most expensive kind. */
export const P90_PER_CREDIT = Math.max(perCredit.staticOne.p90, perCredit.staticThree.p90, perCredit.motion.p90);
/** On the Codex subscription the image/LLM marginal cost is the flat fee; only compute is per credit. */
export const CODEX_PER_CREDIT = RAILWAY_PER_STATIC;

export function marginAt(priceUsd: number, credits: number, perCreditUsd: number): number {
  return (priceUsd - (priceUsd * STRIPE_PCT + STRIPE_FIXED) - credits * perCreditUsd) / priceUsd;
}

// ---------- 2. Synthetic Van Westendorp panel ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

interface Segment {
  key: string;
  label: string;
  weight: number;
  /** Median monthly answers (USD) for "a tool that makes my ads from my website": too cheap, bargain, getting expensive, too expensive. */
  anchors: readonly [number, number, number, number];
  /** Median credits/month needed (1 credit = 1 static ad in one size). */
  needCredits: number;
  tier: "starter" | "growth" | "scale";
  why: string;
}

export const SEGMENTS: readonly Segment[] = [
  { key: "solo", label: "Solo founders / small business", weight: 0.3, anchors: [12, 29, 59, 99], needCredits: 25, tier: "starter", why: "Canva Pro $18, Pencil $14, AdCreative Starter $39/20 downloads, Creatify Starter $39" },
  { key: "local", label: "Local service businesses", weight: 0.2, anchors: [15, 35, 69, 119], needCredits: 20, tier: "starter", why: "freelance static ad $15-60 each, 4-8 ads/month; Canva Pro $18" },
  { key: "ecom", label: "Ecommerce brands", weight: 0.25, anchors: [25, 59, 129, 229], needCredits: 80, tier: "growth", why: "AdCreative Starter $89-189 for 50-120 downloads, Creatify Pro $99, Lapis $99" },
  { key: "startup", label: "In-house marketers at funded startups", weight: 0.1, anchors: [39, 89, 199, 349], needCredits: 120, tier: "growth", why: "AdCreative Professional $249/50, design subscriptions from ~$500-649/month" },
  { key: "agency", label: "Freelancers / agencies making ads for clients", weight: 0.15, anchors: [49, 119, 279, 499], needCredits: 240, tier: "scale", why: "AdCreative Professional $249-400, Ultimate $999; client retainers $500-3,000/month" },
];

interface Respondent extends VwResponse {
  segment: string;
  tier: Segment["tier"];
  need: number;
}

export function buildPanel(n = 4000, seed = 20261107): Respondent[] {
  const rnd = mulberry32(seed);
  const out: Respondent[] = [];
  for (const seg of SEGMENTS) {
    const count = Math.round(n * seg.weight);
    for (let i = 0; i < count; i++) {
      const level = normal(rnd) * 0.35; // shared willingness-to-pay shift per respondent
      const answers = seg.anchors.map((a) => Math.max(1, Math.round(a * Math.exp(level + normal(rnd) * 0.18)))).sort((x, y) => x - y);
      const [tooCheap = 0, cheap = 0, expensive = 0, tooExpensive = 0] = answers;
      out.push({ segment: seg.key, tier: seg.tier, need: Math.round(seg.needCredits * Math.exp(normal(rnd) * 0.4)), tooCheap, cheap, expensive, tooExpensive });
    }
  }
  return out;
}

/** Gabor-Granger-style purchase probability from the same answers: 1 at/below "bargain", 0 at/above "too expensive". */
export function buyProb(r: VwResponse, price: number): number {
  if (price <= r.cheap) return 1;
  if (price >= r.tooExpensive) return 0;
  if (price <= r.expensive) return 1 - (0.5 * (price - r.cheap)) / Math.max(1, r.expensive - r.cheap);
  return 0.5 - (0.5 * (price - r.expensive)) / Math.max(1, r.tooExpensive - r.expensive);
}

const NICE = [19, 29, 39, 49, 59, 69, 79, 89, 99, 119, 129, 149, 179, 199, 229, 249, 299, 349, 399, 449, 499];

function creditsFor(price: number): number {
  return Math.floor((price * (1 - STRIPE_PCT) - STRIPE_FIXED - TARGET_MARGIN * price) / P90_PER_CREDIT / 5) * 5;
}

export function simulate() {
  const panel = buildPanel();
  const overall = computeVanWestendorp(panel);
  const bySegment: Record<string, VwResult> = {};
  for (const s of SEGMENTS) bySegment[s.key] = computeVanWestendorp(panel.filter((r) => r.segment === s.key));
  const tiers = (["starter", "growth", "scale"] as const).map((tier) => {
    const sub = panel.filter((r) => r.tier === tier);
    const vw = computeVanWestendorp(sub);
    const lo = vw.pmc ?? 0;
    const hi = vw.pme ?? Infinity;
    const curve = NICE.map((p) => {
      const share = sub.reduce((a, r) => a + buyProb(r, p), 0) / sub.length;
      return { price: p, share, revenueIndex: p * share };
    });
    const inRange = curve.filter((c) => c.price >= lo && c.price <= hi);
    const best = inRange.reduce((a, c) => (c.revenueIndex > a.revenueIndex ? c : a), inRange[0] ?? { price: 0, share: 0, revenueIndex: 0 });
    return { tier, vw, curve, revenueMax: best.price, maxCredits: creditsFor(best.price), medianNeed: quantile(sub.map((r) => r.need), 0.5) };
  });
  return { panelSize: panel.length, overall, bySegment, tiers, demandOverall: NICE.map((p) => ({ price: p, share: panel.reduce((a, r) => a + buyProb(r, p), 0) / panel.length })) };
}

function chartSvg(sim: ReturnType<typeof simulate>): string {
  const panel = buildPanel();
  const W = 760, H = 420, L = 60, B = 50, T = 30, R = 20;
  const maxP = 400;
  const x = (p: number) => L + ((W - L - R) * p) / maxP;
  const y = (s: number) => T + (H - T - B) * (1 - s);
  const n = panel.length;
  const curves: Array<[string, string, (p: number) => number]> = [
    ["too cheap", "#2563eb", (p) => panel.filter((r) => r.tooCheap >= p).length / n],
    ["bargain", "#16a34a", (p) => panel.filter((r) => r.cheap >= p).length / n],
    ["getting expensive", "#f59e0b", (p) => panel.filter((r) => r.expensive <= p).length / n],
    ["too expensive", "#dc2626", (p) => panel.filter((r) => r.tooExpensive <= p).length / n],
    ["would buy (GG)", "#6b7280", (p) => panel.reduce((a, r) => a + buyProb(r, p), 0) / n],
  ];
  const paths = curves.map(([name, color, f], i) => {
    const d = Array.from({ length: 81 }, (_, k) => k * 5).map((p, k) => `${k ? "L" : "M"}${x(p).toFixed(1)},${y(f(p)).toFixed(1)}`).join("");
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5"${name.startsWith("would") ? ' stroke-dasharray="6 4"' : ""}/><text x="${W - 190}" y="${T + 16 + i * 18}" fill="${color}" font-size="13">${name}</text>`;
  });
  const o = sim.overall;
  const marks = ([["PMC", o.pmc], ["OPP", o.opp], ["IPP", o.ipp], ["PME", o.pme]] as const).map(([k, v], i) => (v === null ? "" : `<line x1="${x(v)}" x2="${x(v)}" y1="${T}" y2="${H - B}" stroke="#111" stroke-dasharray="2 3"/><text x="${x(v) + 3}" y="${H - B - 8 - i * 14}" font-size="12">${k} $${Math.round(v)}</text>`));
  const ticks = [0, 50, 100, 150, 200, 250, 300, 350, 400].map((p) => `<text x="${x(p) - 10}" y="${H - B + 18}" font-size="12">$${p}</text>`);
  const yt = [0, 0.25, 0.5, 0.75, 1].map((s) => `<text x="${L - 40}" y="${y(s) + 4}" font-size="12">${s * 100}%</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica,Arial,sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="${L}" y="20" font-size="15" font-weight="bold">Website2ads monthly plan - Van Westendorp, synthetic panel n=${sim.panelSize}</text><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#999"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="#999"/>${ticks.join("")}${yt.join("")}${paths.join("")}${marks.join("")}</svg>`;
}

async function main(): Promise<void> {
  const sim = simulate();
  const rows = [
    ...ADS_PLANS.map((p) => ({ name: p.name, price: p.priceCents / 100, credits: p.monthlyCredits })),
    ...ADS_TOPUPS.map((t) => ({ name: `Top-up ${t.name}`, price: t.priceCents / 100, credits: t.credits })),
  ].map((r) => ({ ...r, perCredit: r.price / r.credits, marginP90Api: marginAt(r.price, r.credits, P90_PER_CREDIT), marginCodex: marginAt(r.price, r.credits, CODEX_PER_CREDIT) }));
  const result = { cost: COST, perCredit, p90PerCredit: P90_PER_CREDIT, sim, priceTable: rows };
  const args = process.argv.slice(2);
  const chartAt = args.indexOf("--chart");
  const chartPath = chartAt >= 0 ? args[chartAt + 1] : undefined;
  if (chartPath) {
    const sharp = (await import("sharp")).default;
    writeFileSync(chartPath, await sharp(Buffer.from(chartSvg(sim))).png().toBuffer());
  }
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const f = (v: number | null) => (v === null ? "-" : `$${v.toFixed(0)}`);
  console.log(`Cost per credit (n=${COST.runs} runs): static 1 size p50 $${perCredit.staticOne.p50.toFixed(3)} p90 $${perCredit.staticOne.p90.toFixed(3)}; static 3 sizes p50 $${perCredit.staticThree.p50.toFixed(3)} p90 $${perCredit.staticThree.p90.toFixed(3)}; animated p50 $${perCredit.motion.p50.toFixed(3)} p90 $${perCredit.motion.p90.toFixed(3)}`);
  console.log(`Trial (10 static + 1 animated) cost p50 $${COST.trial.p50.toFixed(2)} p90 $${COST.trial.p90.toFixed(2)}`);
  console.log(`Overall VW: PMC ${f(sim.overall.pmc)} OPP ${f(sim.overall.opp)} IPP ${f(sim.overall.ipp)} PME ${f(sim.overall.pme)}`);
  for (const s of SEGMENTS) {
    const v = sim.bySegment[s.key];
    if (v) console.log(`  ${s.label}: PMC ${f(v.pmc)} OPP ${f(v.opp)} IPP ${f(v.ipp)} PME ${f(v.pme)}`);
  }
  for (const t of sim.tiers) console.log(`Tier ${t.tier}: range ${f(t.vw.pmc)}-${f(t.vw.pme)}, OPP ${f(t.vw.opp)} IPP ${f(t.vw.ipp)}, revenue-max $${t.revenueMax}, max credits at 70% p90 margin ${t.maxCredits}, median need ${t.medianNeed}`);
  for (const r of rows) console.log(`${r.name}: $${r.price} / ${r.credits} credits = $${r.perCredit.toFixed(2)}/credit; margin p90 API ${(r.marginP90Api * 100).toFixed(1)}%, Codex ${(r.marginCodex * 100).toFixed(1)}%`);
}

if (process.argv[1]?.endsWith("ads-pricing-sim.ts")) void main();

// Website2ads plans and top-up packs (pricing v2, 2026-11-07). Rationale: goal folder PRICING.md.
// Van Westendorp desk estimate from 2026 competitor prices (AdCreative $39/20 downloads, Creatify $39-99,
// done-for-you ~$1,000/6 ads): optimal price point ~$49, indifference ~$99 for small businesses. A real
// in-app Van Westendorp survey (pricing-survey) recalibrates this from trial users.
// Hormozi money model: attraction = free trial (10 static + 1 motion); continuity = monthly plans with the
// expensive tier as the anchor; downsell = one-time credit packs, no subscription needed; guarantee = 30-day
// money-back on the first month (refund from admin).
// Margin: composed static ~= $0.11 per ratio at API list prices (Codex subscription is a flat fee); lowest
// credit price is Scale $249/650 = $0.383/credit -> ~71% gross margin even at list prices (>= 70% target).
// Price IDs come from env (created by scripts/ads-stripe-setup.ts); a missing ID = not purchasable.
// Pure module: safe to import from client components (reads only env strings).

export type AdsPlanKey = "starter" | "growth" | "scale";
export type AdsTopupKey = "topup_50" | "topup_150";

export interface AdsPlanTier {
  key: AdsPlanKey;
  name: string;
  priceCents: number;
  monthlyCredits: number;
  priceEnv: string;
  highlights: string[];
}

export interface AdsTopupPack {
  key: AdsTopupKey;
  name: string;
  priceCents: number;
  credits: number;
  priceEnv: string;
}

export const ADS_PLANS: readonly AdsPlanTier[] = [
  {
    key: "starter",
    name: "Starter",
    priceCents: 4900,
    monthlyCredits: 120,
    priceEnv: "STRIPE_ADS_STARTER_PRICE_ID",
    highlights: ["120 credits / month (about 40 ads in all 3 sizes)", "All sizes: 4:5, 1:1, 9:16", "All 5 awareness levels", "Animated ads"],
  },
  {
    key: "growth",
    name: "Growth",
    priceCents: 9900,
    monthlyCredits: 250,
    priceEnv: "STRIPE_ADS_GROWTH_PRICE_ID",
    highlights: ["250 credits / month (about 80 ads in all 3 sizes)", "Everything in Starter", "Publish to Meta in one click"],
  },
  {
    key: "scale",
    name: "Scale",
    priceCents: 24900,
    monthlyCredits: 650,
    priceEnv: "STRIPE_ADS_SCALE_PRICE_ID",
    highlights: ["650 credits / month (about 215 ads in all 3 sizes)", "Everything in Growth", "Priority generation"],
  },
];

export const ADS_TOPUPS: readonly AdsTopupPack[] = [
  { key: "topup_50", name: "50 credits", priceCents: 3500, credits: 50, priceEnv: "STRIPE_ADS_TOPUP_50_PRICE_ID" },
  { key: "topup_150", name: "150 credits", priceCents: 8900, credits: 150, priceEnv: "STRIPE_ADS_TOPUP_150_PRICE_ID" },
];

/** Hormozi-style risk reversal shown next to plans; refunds are issued from the admin refunds page. */
export const ADS_GUARANTEE = "30-day money-back guarantee on your first month. Not happy with the ads? Ask and we refund it.";

export function getPlan(key: string): AdsPlanTier | undefined {
  return ADS_PLANS.find((p) => p.key === key);
}

export function getTopup(key: string): AdsTopupPack | undefined {
  return ADS_TOPUPS.find((t) => t.key === key);
}

export function priceIdFor(item: { priceEnv: string }, env: Record<string, string | undefined> = process.env): string | null {
  return env[item.priceEnv] || null;
}

export function planFromPriceId(priceId: string, env: Record<string, string | undefined> = process.env): AdsPlanTier | undefined {
  return ADS_PLANS.find((p) => priceIdFor(p, env) === priceId);
}

/** Monthly price for MRR maths; unknown plans count as 0. */
export function planMonthlyCents(planKey: string): number {
  return getPlan(planKey)?.priceCents ?? 0;
}

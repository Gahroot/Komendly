// Ozzy plans (one credit wallet for Ad Packs + Ozzy Studio; Scale/Agency include testimonial videos: src/lib/hub/money-model.ts) and top-up packs (pricing v3, 2026-11-07). Rationale: goal folder PRICING.md;
// reproduce with `npx tsx scripts/ads-pricing-sim.ts`.
// Priced to survive without the Codex subscription: at OpenAI API list prices (gpt-image-2 medium $0.053
// + prompt + 4 reference images per call, gpt-6.1-sol text, vision QC, retries, Railway share) the p90 cost
// is $0.53 per credit (p50 $0.27), from 46 real dev-DB runs. Every plan and pack keeps >= 70% gross margin
// at that p90 cost with all credits used, after Stripe 2.9% + 30c (tested in __tests__/billing-config.test.ts).
// Prices come from a seeded Van Westendorp + Gabor-Granger Monte Carlo panel (5 segments anchored on 2026
// AdCreative.ai / Creatify / Canva / freelancer / agency prices): overall PMC $48, OPP $64, IPP $69, PME $95.
// Each tier is the revenue-max price inside its own segment's acceptable range (Starter $29-59, Growth
// $66-133, Scale $121-246); credits are the most that keep the 70% floor.
// Hormozi money model: attraction = free trial (10 static + 1 motion); continuity = monthly plans with Scale
// as the anchor; downsell = one-time credit packs, priced per credit above every plan, no subscription;
// guarantee = 30-day money-back on the first month (refund from admin).
// Price IDs come from env (created by scripts/ads-stripe-setup.ts); a missing ID = not purchasable.
// Pure module: safe to import from client components (reads only env strings).

export type AdsPlanKey = "starter" | "growth" | "scale" | "agency";
export type BillingInterval = "month" | "year";
export type AdsTopupKey = "topup_10" | "topup_30" | "unlock_pack";

export interface AdsPlanTier {
  key: AdsPlanKey;
  name: string;
  priceCents: number;
  monthlyCredits: number;
  priceEnv: string;
  /** Annual prepay price (2 months free: 10x monthly), all 12 months of credits granted on payment. */
  annualPriceEnv: string;
  /** Gift packs (3 free ads for another business) per calendar month while subscribed. */
  giftsPerMonth: number;
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
    monthlyCredits: 20,
    priceEnv: "STRIPE_ADS_STARTER_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_STARTER_ANNUAL_PRICE_ID",
    giftsPerMonth: 1,
    highlights: ["20 Ozzy credits / month for Ad Packs and Ozzy Studio", "About 4 Studio videos or 20 static ads, mix as you like", "All sizes (4:5, 1:1, 9:16) · animated ads", "Buy one, give one: 1 gift pack a month for a friend"],
  },
  {
    key: "growth",
    name: "Growth",
    priceCents: 11900,
    monthlyCredits: 55,
    priceEnv: "STRIPE_ADS_GROWTH_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_GROWTH_ANNUAL_PRICE_ID",
    giftsPerMonth: 1,
    highlights: ["55 Ozzy credits / month for Ad Packs and Ozzy Studio", "About 11 Studio videos or 55 static ads", "Edit your own footage: up to 90s, 500 MB uploads", "Everything in Starter, lower price per credit"],
  },
  {
    key: "scale",
    name: "Scale",
    priceCents: 22900,
    monthlyCredits: 115,
    priceEnv: "STRIPE_ADS_SCALE_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_SCALE_ANNUAL_PRICE_ID",
    giftsPerMonth: 1,
    highlights: ["115 Ozzy credits / month for Ad Packs and Ozzy Studio", "1 AI testimonial video / month (a real review, on camera)", "About 23 Studio videos or 115 static ads", "Everything in Growth, priority generation"],
  },
  {
    // Agency (2026-11-09): many client brands in one workspace. 255 credits = the most that keeps the 70% floor
    // at p90 API cost ($1.96/credit, lowest of any plan). Brands per workspace are not limited on any plan.
    key: "agency",
    name: "Agency",
    priceCents: 49900,
    monthlyCredits: 255,
    priceEnv: "STRIPE_ADS_AGENCY_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_AGENCY_ANNUAL_PRICE_ID",
    giftsPerMonth: 4,
    highlights: ["255 Ozzy credits / month for Ad Packs and Ozzy Studio", "3 AI testimonial videos / month", "All your client brands in one workspace, lowest price per credit", "4 gift packs a month to pitch new clients · priority generation"],
  },
];

/** Annual prepay: pay for 10 months, get 12 (credits for all 12 months land on payment, valid for the year). */
export const ANNUAL_MONTHS_PAID = 10;
export const ANNUAL_MONTHS = 12;

export function annualPriceCents(plan: AdsPlanTier): number {
  return plan.priceCents * ANNUAL_MONTHS_PAID;
}

export function annualCredits(plan: AdsPlanTier): number {
  return plan.monthlyCredits * ANNUAL_MONTHS;
}

export function annualPriceIdFor(plan: AdsPlanTier, env: Record<string, string | undefined> = process.env): string | null {
  return env[plan.annualPriceEnv] || null;
}

/** Billing interval of a plan price id ("year" for annual prepay prices), else null. */
export function intervalFromPriceId(priceId: string, env: Record<string, string | undefined> = process.env): BillingInterval | null {
  for (const p of ADS_PLANS) {
    if (priceIdFor(p, env) === priceId) return "month";
    if (annualPriceIdFor(p, env) === priceId) return "year";
  }
  return null;
}

export const ADS_TOPUPS: readonly AdsTopupPack[] = [
  { key: "topup_10", name: "10 credits", priceCents: 2900, credits: 10, priceEnv: "STRIPE_ADS_TOPUP_10_PRICE_ID" },
  { key: "topup_30", name: "30 credits", priceCents: 7900, credits: 30, priceEnv: "STRIPE_ADS_TOPUP_30_PRICE_ID" },
];

/**
 * $9 tripwire "Unlock this pack" (downsell after the Launch Quarter is dismissed or closed, and on checkout cancel):
 * one payment unlocks every locked bonus ad (a `topup` ledger row is what bonus-unlock checks) and adds 3 credits.
 * Not listed with the credit packs. The coupon takes the $9 off a first Starter month (never-subscribed buyers only).
 */
export const UNLOCK_PACK: AdsTopupPack = { key: "unlock_pack", name: "Unlock this pack", priceCents: 900, credits: 3, priceEnv: "STRIPE_ADS_UNLOCK_PACK_PRICE_ID" };
/** CreditLedger note on the unlock_pack topup row (how checkout knows the buyer earned the Starter coupon). */
export const UNLOCK_PACK_NOTE = "unlock_pack";
export const UNLOCK_PACK_COUPON_ENV = "STRIPE_ADS_UNLOCK_PACK_COUPON_ID";

export function unlockPackCouponId(env: Record<string, string | undefined> = process.env): string | null {
  return env[UNLOCK_PACK_COUPON_ENV] || null;
}

/** Hormozi-style risk reversal shown next to plans; refunds are issued from the admin refunds page. */
export const ADS_GUARANTEE = "30-day money-back guarantee on your first month. Not happy with the ads? Ask and we refund it.";

export function getPlan(key: string): AdsPlanTier | undefined {
  return ADS_PLANS.find((p) => p.key === key);
}

export function getTopup(key: string): AdsTopupPack | undefined {
  return key === UNLOCK_PACK.key ? UNLOCK_PACK : ADS_TOPUPS.find((t) => t.key === key);
}

export function priceIdFor(item: { priceEnv: string }, env: Record<string, string | undefined> = process.env): string | null {
  return env[item.priceEnv] || null;
}

export function planFromPriceId(priceId: string, env: Record<string, string | undefined> = process.env): AdsPlanTier | undefined {
  return ADS_PLANS.find((p) => priceIdFor(p, env) === priceId || annualPriceIdFor(p, env) === priceId);
}

/** Monthly price for MRR maths; unknown plans count as 0. */
export function planMonthlyCents(planKey: string): number {
  return getPlan(planKey)?.priceCents ?? 0;
}

// Post-trial money model (goal folder komendly-ad-rdy/MONEY_MODEL.md): menu upsell on the trial run page
// (Scale anchor -> Launch Quarter recommended -> Growth), downsell on checkout cancel (Starter, then topup_10).
export type AdsOfferKey = "launch_quarter";

export interface AdsLaunchOffer {
  key: AdsOfferKey;
  name: string;
  priceCents: number;
  /** Stripe recurring interval count in months. */
  intervalMonths: number;
  creditsPerPeriod: number;
  /** Extra credits on the first invoice only. */
  firstPeriodBonus: number;
  /** Plan whose features the subscriber gets. */
  plan: AdsPlanKey;
  /** Hours after the trial run's ads are ready that the offer can be bought (server-enforced). */
  windowHours: number;
  priceEnv: string;
}

export const LAUNCH_QUARTER: AdsLaunchOffer = {
  key: "launch_quarter",
  name: "Launch Quarter",
  priceCents: 12900,
  intervalMonths: 3,
  creditsPerPeriod: 60,
  firstPeriodBonus: 5,
  plan: "starter",
  windowHours: 72,
  priceEnv: "STRIPE_ADS_LAUNCH_QUARTER_PRICE_ID",
};

export const LAUNCH_QUARTER_GUARANTEE =
  "30-day money-back guarantee on your first payment. Not happy with the ads? Ask and we refund it.";

export function getOffer(key: string): AdsLaunchOffer | undefined {
  return key === LAUNCH_QUARTER.key ? LAUNCH_QUARTER : undefined;
}

export function offerFromPriceId(priceId: string, env: Record<string, string | undefined> = process.env): AdsLaunchOffer | undefined {
  return priceIdFor(LAUNCH_QUARTER, env) === priceId ? LAUNCH_QUARTER : undefined;
}

/** Ready (non-bonus) trial ads that open the Launch Quarter window, before the run finishes. */
export const LAUNCH_OFFER_MIN_READY = 3;

/**
 * When the trial's ads count as "ready" for the offer window: the moment the run had LAUNCH_OFFER_MIN_READY ready
 * ads (`readyTimes` = when each main ad got its first asset), or the run's completion if that came first.
 */
export function launchOfferReadyAt(readyTimes: Date[], completedAt: Date | null | undefined, minReady: number = LAUNCH_OFFER_MIN_READY): Date | null {
  const sorted = [...readyTimes].sort((a, b) => a.getTime() - b.getTime());
  const nth = sorted[minReady - 1] ?? null;
  if (nth && completedAt) return nth < completedAt ? nth : completedAt;
  return nth ?? completedAt ?? null;
}

/** When the launch offer closes for a trial whose ads were ready at `readyAt`; null if not ready yet. */
export function launchOfferExpiresAt(readyAt: Date | null | undefined, offer: AdsLaunchOffer = LAUNCH_QUARTER): Date | null {
  return readyAt ? new Date(readyAt.getTime() + offer.windowHours * 3_600_000) : null;
}

export function isLaunchOfferOpen(readyAt: Date | null | undefined, now: Date, offer: AdsLaunchOffer = LAUNCH_QUARTER): boolean {
  const expires = launchOfferExpiresAt(readyAt, offer);
  return expires !== null && now.getTime() >= (readyAt?.getTime() ?? 0) && now < expires;
}

/** Credits for one paid offer invoice: first invoice includes the bonus, renewals don't. */
export function offerCreditsFor(offer: AdsLaunchOffer, firstInvoice: boolean): number {
  return offer.creditsPerPeriod + (firstInvoice ? offer.firstPeriodBonus : 0);
}

/** Saving vs paying the plan monthly for the same months, in cents. */
export function offerSavingsCents(offer: AdsLaunchOffer): number {
  return (getPlan(offer.plan)?.priceCents ?? 0) * offer.intervalMonths - offer.priceCents;
}

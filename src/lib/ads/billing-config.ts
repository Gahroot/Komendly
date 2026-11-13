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
// guarantee = 30-day one-click refund of the first payment (self-serve, src/lib/ads/self-refund.ts).
// Price IDs come from env (created by scripts/ads-stripe-setup.ts); a missing ID = not purchasable.
// Pure module: safe to import from client components (reads only env strings).

export type AdsPlanKey = "starter" | "ad_department" | "growth" | "scale" | "agency";
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
  /** Hidden from every new-purchase surface (still works for existing subscribers: webhook, renewals, billing page). */
  hiddenForNewBuyers?: boolean;
  /** The plan the pricing pages recommend. */
  recommended?: boolean;
  /** Weekly Drop: 5 static + 1 animated ad every Monday, not charged to credits (engine: worker B). */
  weeklyDrop?: boolean;
  /** Unlimited plans: how many of the member's own businesses (website domains) the unlimited Ad Packs cover. */
  unlimitedBrands?: number;
  /** Unlimited plans: ad runs / Studio turns that may be in progress at once (fair use). Default 1. */
  concurrent?: number;
  /** Ad Packs and Ozzy Studio cost 0 credits (fair use: 1 run + 1 Studio turn in progress at a time). */
  unlimited?: boolean;
}

// Ozzy Ad Department, Founding Unlimited (owner decision 2026-11-11): the hero plan sold after the free pack.
// Single price constant: changing the price is this one line (+ a new Stripe price, see scripts/ads-stripe-setup.ts).
export const AD_DEPARTMENT_PRICE_CENTS = 19700;
/** Unlimited: Ad Packs + Ozzy Studio cost 0 credits on ad_department (fair use: one run + one Studio turn at a time). */
export const AD_DEPARTMENT_UNLIMITED = true;
/** Founding offer: Growth and Scale are hidden from new buyers while it runs. */
export const FOUNDING_OFFER_ACTIVE = true;
export const FOUNDING_FAIR_USE = "Unlimited ads and Studio videos, made one at a time.";
export const FOUNDING_TERMS =
  "Founding offer for the first 100 members or until we end it. Unlimited is guaranteed for your first 3 months; after that we'd give you 30 days' notice before any change. Cancel anytime in one click.";
export const FOUNDING_PRICE_LOCK = "Founding members keep their price for as long as they stay subscribed.";

/** The Hormozi value stack shown next to the hero plan (values are stated monthly worth, in dollars). */
export const AD_DEPARTMENT_STACK: readonly { label: string; detail: string; valueUsd: number; bonus?: boolean }[] = [
  { label: "Unlimited ads + Ozzy Studio videos", detail: "Make as many Ad Packs and videos as you like, one at a time", valueUsd: 500 },
  { label: "Weekly Drop", detail: "Ozzy Autopilot: 6 new ads + a new 15s video every Monday, steered by your one-sentence focus", valueUsd: 300 },
  { label: "Ozzy Ad Coach", detail: "Show him your Ads Manager results; he says what to keep, what to kill, and makes more winners", valueUsd: 200 },
  { label: "Website check-up", detail: "Ozzy checks the page your ads send people to", valueUsd: 300, bonus: true },
  { label: "30-day ad plan", detail: "What to post, when, and what to test, day by day", valueUsd: 250, bonus: true },
  { label: "Hook & caption library", detail: "Proven openers and captions written for your brand", valueUsd: 150, bonus: true },
];

export function stackTotalUsd(): number {
  return AD_DEPARTMENT_STACK.reduce((n, i) => n + i.valueUsd, 0);
}
/** Weekly Drop cost basis: 5 static (1 credit each) + 1 animated (5 credits) = 10 credits/week = ~43 a month. */
export const WEEKLY_DROP_CREDIT_EQUIVALENTS_PER_MONTH = 43;
/** The 72h first-month discount on the hero plan: $100 off once ($197 -> $97). */
export const LAUNCH_FIRST_MONTH_OFF_CENTS = 10000;

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
    key: "ad_department",
    name: "Ozzy Ad Department",
    priceCents: AD_DEPARTMENT_PRICE_CENTS,
    // Unlimited replaces credits: the grant stays (0) so the ledger code paths are unchanged.
    monthlyCredits: 0,
    priceEnv: "STRIPE_ADS_AD_DEPARTMENT_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_AD_DEPARTMENT_ANNUAL_PRICE_ID",
    giftsPerMonth: 1,
    recommended: true,
    weeklyDrop: true,
    unlimited: AD_DEPARTMENT_UNLIMITED,
    unlimitedBrands: 1,
    concurrent: 1,
    highlights: ["Unlimited ads and Studio videos for your business, made one at a time", "Ozzy Autopilot: fresh ads + a new video every Monday (5 static + 1 animated + a 15s video), steered by one sentence from you", "Ozzy Ad Coach: show him your results, he says what to keep and kill", "Bonuses: website check-up, 30-day ad plan, hook & caption library", "Post Ozzy's ads for 30 days. Not happy? One click, full refund."],
  },
  {
    key: "growth",
    name: "Growth",
    priceCents: 11900,
    monthlyCredits: 55,
    priceEnv: "STRIPE_ADS_GROWTH_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_GROWTH_ANNUAL_PRICE_ID",
    giftsPerMonth: 1,
    // Hidden from new buyers during the founding offer (2026-11-11); existing subscribers keep it at their price.
    hiddenForNewBuyers: FOUNDING_OFFER_ACTIVE,
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
    hiddenForNewBuyers: FOUNDING_OFFER_ACTIVE,
    highlights: ["115 Ozzy credits / month for Ad Packs and Ozzy Studio", "1 AI testimonial video / month (a real review, on camera)", "About 23 Studio videos or 115 static ads", "Everything in Growth, priority generation"],
  },
  {
    // Agency (owner decision 2026-11-11): Ad Department, unlimited, for up to 10 client brands, 3 in progress at a time,
    // plus 3 testimonial videos and 4 gift packs a month. No Agency subscribers existed when it went unlimited.
    key: "agency",
    name: "Agency",
    priceCents: 49700,
    monthlyCredits: 0,
    priceEnv: "STRIPE_ADS_AGENCY_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_AGENCY_ANNUAL_PRICE_ID",
    giftsPerMonth: 4,
    weeklyDrop: true,
    unlimited: true,
    unlimitedBrands: 10,
    concurrent: 3,
    highlights: ["Everything in Ozzy Ad Department, for up to 10 client brands", "Ozzy Autopilot: fresh ads + a new video every Monday", "Unlimited ads and Studio videos, 3 at a time", "3 AI testimonial videos / month (real reviews, on camera)", "4 gift packs a month to pitch new clients"],
  },
];

/** Plans shown to new buyers, in menu order: Starter (fallback), Ozzy Ad Department (hero), Agency (multi-brand). */
export const PLANS_FOR_SALE: readonly AdsPlanTier[] = ADS_PLANS.filter((p) => !p.hiddenForNewBuyers);

/** Can a new subscription be started on this plan? (Growth: no; existing Growth subscribers are unaffected.) */
export function isPlanForSale(key: string): boolean {
  return PLANS_FOR_SALE.some((p) => p.key === key);
}


export interface PlanCheckWorkspace {
  adsPlan: string;
  subscriptionStatus: string;
  suspendedAt?: Date | null;
}

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

function activeOn(ws: PlanCheckWorkspace): boolean {
  return ACTIVE_SUB_STATUSES.has(ws.subscriptionStatus) && !ws.suspendedAt;
}

/** Workspace has Ozzy Ad Department features (Ad Department or Agency) with a live subscription (Weekly Drop, Ad Coach, bonuses). */
export function hasAdDepartment(ws: PlanCheckWorkspace): boolean {
  return (ws.adsPlan === "ad_department" || ws.adsPlan === "agency") && activeOn(ws);
}

/** Unlimited plans: how many runs / Studio turns may be in progress at once (1 unless the plan says more). */
export function concurrentLimit(ws: PlanCheckWorkspace): number {
  return getPlan(ws.adsPlan)?.concurrent ?? 1;
}

/** Unlimited plans: how many of the member's own businesses the unlimited Ad Packs cover (null = no cap). */
export function unlimitedBrandLimit(ws: PlanCheckWorkspace): number | null {
  return isUnlimitedPlan(ws) ? (getPlan(ws.adsPlan)?.unlimitedBrands ?? null) : null;
}

/** Pure: may an unlimited workspace start ads for `domain`, given the businesses it already uses? */
export function brandAllowed(domain: string, ownDomains: readonly string[], limit: number | null): boolean {
  if (limit === null || ownDomains.includes(domain)) return true;
  return new Set(ownDomains).size < limit;
}

export const BRAND_LIMIT_MESSAGE = (limit: number) =>
  limit === 1
    ? "Your plan covers one business. To make ads for more brands, Agency covers up to 10."
    : `Your plan covers up to ${limit} brands. Reply to any Ozzy email and we'll sort out more.`;

/** Ad Packs and Ozzy Studio are free (0 credits) for this workspace: an active plan with `unlimited`. */
export function isUnlimitedPlan(ws: PlanCheckWorkspace): boolean {
  return Boolean(getPlan(ws.adsPlan)?.unlimited) && activeOn(ws);
}

/** Fair-use message when an unlimited workspace already has something in progress (plain words, no jargon). */
export const UNLIMITED_BUSY_MESSAGE = "Ozzy is still on your last one. Give him a minute to finish, then start the next.";

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

/** Hormozi-style risk reversal shown next to plans; self-serve refund on the billing page (src/lib/ads/self-refund.ts). */
export const ADS_GUARANTEE = "Post Ozzy's ads for 30 days. Not happy? One click, full refund.";
/** Self-serve refund window after the first paid invoice of a workspace's first subscription. */
export const GUARANTEE_DAYS = 30;

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
export type AdsOfferKey = "launch_department" | "launch_quarter";

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
  /** Coupon offers ride on the plan's own price (renewals are plain plan invoices); the coupon discounts invoice 1. */
  couponEnv?: string;
  /** What the first invoice costs (coupon offers); else priceCents. */
  firstPaymentCents?: number;
}

/**
 * The 72h post-trial launch offer (2026-11-11): the first month of Ozzy Ad Department for $97 (a once coupon of
 * $100 off the $197 monthly price). Renewals are plain ad_department invoices. The export keeps its old name so
 * every surface picks up the new offer.
 */
export const LAUNCH_QUARTER: AdsLaunchOffer = {
  key: "launch_department",
  name: "Founding first month",
  priceCents: AD_DEPARTMENT_PRICE_CENTS,
  intervalMonths: 1,
  creditsPerPeriod: 0,
  firstPeriodBonus: 0,
  plan: "ad_department",
  windowHours: 72,
  priceEnv: "STRIPE_ADS_AD_DEPARTMENT_PRICE_ID",
  couponEnv: "STRIPE_ADS_LAUNCH_FIRST_MONTH_COUPON_ID",
  firstPaymentCents: AD_DEPARTMENT_PRICE_CENTS - LAUNCH_FIRST_MONTH_OFF_CENTS,
};

export function offerCouponId(offer: AdsLaunchOffer, env: Record<string, string | undefined> = process.env): string | null {
  return offer.couponEnv ? env[offer.couponEnv] || null : null;
}

/** What the buyer pays today for the offer. */
export function offerFirstPaymentCents(offer: AdsLaunchOffer): number {
  return offer.firstPaymentCents ?? offer.priceCents;
}

/** Legacy $129 / 3 months of Starter: no longer sold, but existing subscribers must keep renewing on it. */
export const LAUNCH_QUARTER_LEGACY: AdsLaunchOffer = {
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

const ALL_OFFERS: readonly AdsLaunchOffer[] = [LAUNCH_QUARTER, LAUNCH_QUARTER_LEGACY];

export const LAUNCH_QUARTER_GUARANTEE = "Post Ozzy's ads for 30 days. Not happy? One click, full refund.";

/** Any known offer, legacy included (webhook metadata fallback). New checkouts only sell LAUNCH_QUARTER. */
export function getOffer(key: string): AdsLaunchOffer | undefined {
  return ALL_OFFERS.find((o) => o.key === key);
}

/** Offers with their own Stripe price (legacy Launch Quarter). Coupon offers use the plan price: never matched here. */
export function offerFromPriceId(priceId: string, env: Record<string, string | undefined> = process.env): AdsLaunchOffer | undefined {
  return ALL_OFFERS.find((o) => !o.couponEnv && priceIdFor(o, env) === priceId);
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
  return (getPlan(offer.plan)?.priceCents ?? 0) * offer.intervalMonths - offerFirstPaymentCents(offer);
}

/** One plain line describing what "unlimited" covers on a plan (null for credit plans). */
export function unlimitedLine(p: Pick<AdsPlanTier, "unlimited" | "unlimitedBrands" | "concurrent">): string | null {
  if (!p.unlimited) return null;
  const brands = p.unlimitedBrands ?? 1;
  const atOnce = p.concurrent ?? 1;
  return `Unlimited ads and Studio videos ${brands === 1 ? "for your business" : `for up to ${brands} brands`}, ${atOnce === 1 ? "made one at a time" : `${atOnce} at a time`}`;
}

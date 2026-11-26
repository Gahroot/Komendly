// Ozzy plans (one credit wallet for Ad Packs + Ozzy Studio; Scale/Agency include testimonial videos: src/lib/hub/money-model.ts) and top-up packs (pricing v3, 2026-11-07). Rationale: goal folder PRICING.md;
// reproduce with `npx tsx scripts/ads-pricing-sim.ts`.
// Priced to survive without the Codex subscription: at OpenAI API list prices (gpt-image-2 medium $0.053
// + prompt + 4 reference images per call, gpt-6.2-sol text, vision QC, retries, Railway share) the p90 cost
// is $0.53 per credit (p50 $0.27), from 46 real dev-DB runs. Every plan and pack keeps >= 70% gross margin
// at that p90 cost with all credits used, after Stripe 2.9% + 30c (tested in __tests__/billing-config.test.ts).
// Prices come from a seeded Van Westendorp + Gabor-Granger Monte Carlo panel (5 segments anchored on 2026
// AdCreative.ai / Creatify / Canva / freelancer / agency prices): overall PMC $48, OPP $64, IPP $69, PME $95.
// Each tier is the revenue-max price inside its own segment's acceptable range (Starter $29-59, Growth
// $66-133, Scale $121-246); credits are the most that keep the 70% floor.
// Hormozi money model: attraction = free pack (10 free ads, 20 via referral; $9 "Unlock this pack" for the rest); continuity = monthly plans with Scale
// as the anchor; downsell = one-time credit packs, priced per credit above every plan, no subscription;
// guarantee = 30-day one-click refund of the first payment (self-serve, src/lib/ads/self-refund.ts).
// Price IDs come from env (created by scripts/ads-stripe-setup.ts); a missing ID = not purchasable.
// Pure module: safe to import from client components (reads only env strings).

export type AdsPlanKey = "starter" | "ad_department" | "autopilot" | "growth" | "scale" | "agency";
export type BillingInterval = "month" | "year";
export type AdsTopupKey = "topup_10" | "topup_30" | "unlock_pack" | "unlimited_week";

export interface AdsPlanTier {
  key: AdsPlanKey;
  name: string;
  /** Public sales name when it differs from `name`. `name` is NOT purely display (Shopify charge-name matching, Stripe product names), so it stays. */
  displayName?: string;
  priceCents: number;
  monthlyCredits: number;
  priceEnv: string;
  /** Annual prepay price (2 months free: 10x monthly), all 12 months of credits granted on payment. Unset = monthly only. */
  annualPriceEnv?: string;
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
  /** Ad Packs and Ozzy Studio cost 0 credits. No plan sets this since 2026-11-13 (owner: never sell unlimited). */
  unlimited?: boolean;
  /** Sold as "Nx Starter" (monthlyCredits = N x Starter's); pricing copy says the multiple, not the credit count. */
  usageMultiple?: number;
}

// Ozzy Ad Department: the DIY weekly-ads plan sold after the free pack ($97 first-month launch offer); Growth Autopilot is the done-for-you hero. Owner decision 2026-11-13: no unlimited plans (no
// obligation to unlimited use); instead "20x Starter" usage, AI-company style, with the credit count kept off pricing copy.
// Single price constant: changing the price is this one line (+ a new Stripe price, see scripts/ads-stripe-setup.ts).
export const AD_DEPARTMENT_PRICE_CENTS = 19700;
/** Starter's monthly credits; the bigger plans are sold as a multiple of it. */
export const STARTER_MONTHLY_CREDITS = 60;
export const AD_DEPARTMENT_USAGE_MULTIPLE = 20;
export const AGENCY_USAGE_MULTIPLE = 50;
/** Founding offer: Growth and Scale are hidden from new buyers while it runs. */
export const FOUNDING_OFFER_ACTIVE = true;
/** One plain line on what the hero plan's usage means (no credit count). */
export const PLAN_USAGE_NOTE = `${AD_DEPARTMENT_USAGE_MULTIPLE}x the usage of Starter: far more ads and Studio videos than most businesses ever make.`;
export const FOUNDING_TERMS = "Founding offer for the first 100 members or until we end it. Cancel anytime in one click.";
export const FOUNDING_PRICE_LOCK = "Founding members keep their price for as long as they stay subscribed.";

/** Public name of the DIY weekly-ads plan (ad_department). Founder decision 2026-11-22: the team moved to Growth Autopilot. */
export const AD_DEPARTMENT_DISPLAY_NAME = "Ozzy Ad Department";

// Growth Autopilot (founder decision 2026-11-22): Ozzy's AI Marketing Team runs the owner's Facebook & Instagram lead
// ads (prd.md §4). Founding price $297/month, locked while subscribed; regular $497. Only AUTOPILOT_FOUNDING_SPOTS
// businesses (enforced at checkout: src/lib/ads/founding-spots.ts). Meta is connected WITH the owner on joining.
export const AUTOPILOT_PRICE_CENTS = 29700;
/** Standard price, shown as the regular price next to the founding price (no Stripe price at this amount yet). */
export const AUTOPILOT_REGULAR_PRICE_CENTS = 49700;
export const AUTOPILOT_FOUNDING_SPOTS = 10;
/** Public name of the autopilot plan ("Ozzy's AI Marketing Team"); AUTOPILOT_PLAN_NAME is the plan's short name. */
export const AUTOPILOT_DISPLAY_NAME = "Ozzy's AI Marketing Team";
export const AUTOPILOT_PLAN_NAME = "Growth Autopilot";
export const AUTOPILOT_FOUNDING_LINE = `Founding spots: ${AUTOPILOT_FOUNDING_SPOTS} businesses. We set up your Meta connection with you when you join.`;
export const AUTOPILOT_PRICE_LOCK = "Founding price, locked for as long as you stay subscribed.";
export const AUTOPILOT_FULL_MESSAGE = "The founding spots are full. Write to nolan@komendly.com to join the waitlist.";

type StackLine = { label: string; detail: string; valueUsd: number; bonus?: boolean };

/**
 * Ozzy Ad Department (do it yourself): fresh ads every week + a coach; the owner posts them. Stated monthly worth in
 * dollars, kept modest. No line claims we launch or run ads. Bonus titles/values must match BONUS_META.
 */
export const AD_DEPARTMENT_STACK: readonly StackLine[] = [
  { label: "Fresh ads every week", detail: "Ozzy makes new ads (and a short video) from your website every Monday, ready for you to post", valueUsd: 300 },
  { label: "Ozzy Ad Coach", detail: "Ask him about any ad and he says what to keep, what to drop, and makes more like the winners", valueUsd: 100, bonus: true },
  { label: "Website check-up", detail: "Ozzy checks the page your ads send people to", valueUsd: 300, bonus: true },
  { label: "30-day ad plan", detail: "What to post, when, and what to test, day by day", valueUsd: 250, bonus: true },
  { label: "Hook & caption library", detail: "Proven openers and captions written for your brand", valueUsd: 150, bonus: true },
];

/**
 * Growth Autopilot's value stack: every line is real work the team does (prd.md §4); no line promises leads, sales
 * or results. Bonus titles/values must match BONUS_META.
 */
export const AUTOPILOT_STACK: readonly StackLine[] = [
  { label: "Fresh ads every week", detail: "Creative Studio writes and designs new ads (and a short video) for you every Monday, steered by what's working", valueUsd: 300 },
  { label: "Your ads launched and run for you", detail: "Launch & Budget Desk sets up your Facebook and Instagram lead ads in your own Meta account and keeps spend inside your monthly limit", valueUsd: 300 },
  { label: "Daily checks", detail: "Performance Analyst looks at results every day, pauses ads that waste money and keeps the ones that work", valueUsd: 200 },
  { label: "Leads to your inbox in minutes", detail: "Lead Desk emails you each new inquiry as soon as Meta sends it", valueUsd: 100 },
  { label: "Weekly plain-English report", detail: "Ozzy tells you what the team did, what you spent and what came of it", valueUsd: 100 },
  { label: "Ozzy Ad Coach", detail: "Ask him about any ad and he says what to keep, what to drop, and makes more like the winners", valueUsd: 100, bonus: true },
  { label: "Website check-up", detail: "Ozzy checks the page your ads send people to", valueUsd: 300, bonus: true },
  { label: "30-day ad plan", detail: "What to post, when, and what to test, day by day", valueUsd: 250, bonus: true },
  { label: "Hook & caption library", detail: "Proven openers and captions written for your brand", valueUsd: 150, bonus: true },
];

export function stackTotalUsd(stack: readonly StackLine[] = AD_DEPARTMENT_STACK): number {
  return stack.reduce((n, i) => n + i.valueUsd, 0);
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
    monthlyCredits: STARTER_MONTHLY_CREDITS,
    priceEnv: "STRIPE_ADS_STARTER_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_STARTER_ANNUAL_PRICE_ID",
    giftsPerMonth: 1,
    highlights: [`${STARTER_MONTHLY_CREDITS} Ozzy credits / month for Ad Packs and Ozzy Studio`, `About ${STARTER_MONTHLY_CREDITS / 5} Studio videos or ${STARTER_MONTHLY_CREDITS} static ads, mix as you like`, "All sizes (4:5, 1:1, 9:16) · animated ads", "Buy one, give one: 1 gift pack a month for a friend"],
  },
  {
    key: "ad_department",
    name: "Ozzy Ad Department",
    displayName: AD_DEPARTMENT_DISPLAY_NAME,
    priceCents: AD_DEPARTMENT_PRICE_CENTS,
    monthlyCredits: STARTER_MONTHLY_CREDITS * AD_DEPARTMENT_USAGE_MULTIPLE,
    usageMultiple: AD_DEPARTMENT_USAGE_MULTIPLE,
    priceEnv: "STRIPE_ADS_AD_DEPARTMENT_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_AD_DEPARTMENT_ANNUAL_PRICE_ID",
    giftsPerMonth: 1,
    weeklyDrop: true,
    highlights: [
      "Fresh ads made from your website every week (and a short video), ready for you to post",
      "Ozzy Ad Coach tells you what's working, what to drop and makes more like the winners",
      "You post them yourself: every size, with the text to paste",
      `Bonuses: website check-up, 30-day ad plan, hook & caption library, ${AD_DEPARTMENT_USAGE_MULTIPLE}x Starter usage for your own ads and videos`,
      "Post Ozzy's ads for 30 days. Not happy? One click, full refund.",
    ],
  },
  {
    // name/priceCents/monthlyCredits are literals on purpose: blog-engine parses them (= AUTOPILOT_PLAN_NAME,
    // AUTOPILOT_PRICE_CENTS, 20x Starter; asserted in __tests__/billing-config.test.ts).
    key: "autopilot",
    name: "Growth Autopilot",
    displayName: AUTOPILOT_DISPLAY_NAME,
    priceCents: 29700,
    monthlyCredits: 1200,
    usageMultiple: AD_DEPARTMENT_USAGE_MULTIPLE,
    priceEnv: "STRIPE_ADS_AUTOPILOT_PRICE_ID",
    giftsPerMonth: 1,
    recommended: true,
    weeklyDrop: true,
    highlights: [
      "Fresh ads every week, launched for you as Facebook and Instagram lead ads in your own Meta account",
      "Checked every day: ads that waste money get paused, the ones that work keep running",
      "Every new lead emailed to you within minutes, plus a weekly plain-English report",
      "Ad spend is paid by you directly to Meta and never goes over your monthly limit",
      AUTOPILOT_FOUNDING_LINE,
      `Everything in Ozzy Ad Department: Ad Coach, website check-up, 30-day ad plan, hook & caption library, ${AD_DEPARTMENT_USAGE_MULTIPLE}x Starter usage`,
      "Not happy in your first 30 days? One click, full refund.",
    ],
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
    // Agency: Ad Department features at 50x Starter usage for client brands, plus 3 testimonial videos and 4 gift
    // packs a month. Was unlimited 2026-11-11..13; no Agency subscriber ever existed.
    key: "agency",
    name: "Agency",
    priceCents: 49700,
    monthlyCredits: STARTER_MONTHLY_CREDITS * AGENCY_USAGE_MULTIPLE,
    usageMultiple: AGENCY_USAGE_MULTIPLE,
    // Unlimited week on Agency covers up to 10 client brands (1 business on every other plan).
    unlimitedBrands: 10,
    priceEnv: "STRIPE_ADS_AGENCY_PRICE_ID",
    annualPriceEnv: "STRIPE_ADS_AGENCY_ANNUAL_PRICE_ID",
    giftsPerMonth: 4,
    weeklyDrop: true,
    concurrent: 3,
    highlights: ["Everything in Ozzy Ad Department, for your client brands", "Ozzy Autopilot: fresh ads + a new video every Monday", `${AGENCY_USAGE_MULTIPLE}x Starter usage for ads and Studio videos, 3 at a time`, "3 AI testimonial videos / month (real reviews, on camera)", "4 gift packs a month to pitch new clients"],
  },
];

/** Plans shown to new buyers: Starter, Ozzy Ad Department (DIY weekly ads), Growth Autopilot (hero, done for you), Agency (multi-brand). */
export const PLANS_FOR_SALE: readonly AdsPlanTier[] = ADS_PLANS.filter((p) => !p.hiddenForNewBuyers);

/** Can a new subscription be started on this plan? (Growth: no; existing Growth subscribers are unaffected.) */
export function isPlanForSale(key: string): boolean {
  return PLANS_FOR_SALE.some((p) => p.key === key);
}


export interface PlanCheckWorkspace {
  adsPlan: string;
  subscriptionStatus: string;
  suspendedAt?: Date | null;
  /** Unlimited week pass end (AdsWorkspace.unlimitedUntil). */
  unlimitedUntil?: Date | null;
}

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

function activeOn(ws: PlanCheckWorkspace): boolean {
  return ACTIVE_SUB_STATUSES.has(ws.subscriptionStatus) && !ws.suspendedAt;
}

/** Plans with the Ozzy Ad Department features (Weekly Drop, Ad Coach, bonuses). */
export const AD_DEPARTMENT_PLAN_KEYS: readonly AdsPlanKey[] = ["ad_department", "autopilot", "agency"];
/** Plans whose subscribers may hire Ozzy's AI Marketing Team (autonomous Meta campaigns). */
export const TEAM_PLAN_KEYS: readonly AdsPlanKey[] = ["autopilot", "agency"];

/** Workspace has Ozzy Ad Department features (Ad Department, Growth Autopilot or Agency) with a live subscription (Weekly Drop, Ad Coach, bonuses). */
export function hasAdDepartment(ws: PlanCheckWorkspace): boolean {
  return (AD_DEPARTMENT_PLAN_KEYS as readonly string[]).includes(ws.adsPlan) && activeOn(ws);
}

/** Workspace may run Ozzy's AI Marketing Team (Growth Autopilot or Agency) with a live subscription, not suspended. */
export function hasTeam(ws: PlanCheckWorkspace): boolean {
  return (TEAM_PLAN_KEYS as readonly string[]).includes(ws.adsPlan) && activeOn(ws);
}

/** Parallel Studio chats / runs an admin may have in progress at once. */
export const ADMIN_CONCURRENT = 20;

/** Unlimited plans: how many runs / Studio turns may be in progress at once (1 unless the plan says more). */
export function concurrentLimit(ws: PlanCheckWorkspace, user?: { isAdmin?: boolean | null } | null): number {
  // Admins (owner decision 2026-11-13): many parallel Studio chats / runs, ahead of a paid "parallel chats" add-on.
  if (user?.isAdmin) return ADMIN_CONCURRENT;
  return getPlan(ws.adsPlan)?.concurrent ?? 1;
}

/** Unlimited (plan or week pass): how many of the member's own businesses the free Ad Packs cover (null = no cap). */
export function unlimitedBrandLimit(ws: PlanCheckWorkspace, now: Date = new Date()): number | null {
  return isUnlimitedPlan(ws, now) ? (getPlan(ws.adsPlan)?.unlimitedBrands ?? 1) : null;
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

/** Ad Packs and Ozzy Studio are free (0 credits) for this workspace: an Unlimited week pass running (or a plan with `unlimited`). */
export function isUnlimitedPlan(ws: PlanCheckWorkspace, now: Date = new Date()): boolean {
  return unlimitedPassActive(ws, now) || (Boolean(getPlan(ws.adsPlan)?.unlimited) && activeOn(ws));
}

/**
 * Unlimited week (owner decision 2026-11-13): unlimited is never a plan, only a one-time 7-day pass bought on top of a
 * paid plan. Nothing recurs, so it can be withdrawn any time (UNLIMITED_WEEK_FOR_SALE=false or unset the price env);
 * passes already bought run to their end. Fair use as before: one Ad Pack + one Studio turn in progress at a time.
 */
export const UNLIMITED_WEEK_DAYS = 7;
export const UNLIMITED_WEEK_FOR_SALE = true;
export const UNLIMITED_WEEK: AdsTopupPack = { key: "unlimited_week", name: "Unlimited week", priceCents: 4900, credits: 0, priceEnv: "STRIPE_ADS_UNLIMITED_WEEK_PRICE_ID" };
/** CreditLedger note on the pass's 0-credit purchase row (idempotency per checkout session). */
export const UNLIMITED_WEEK_NOTE = "unlimited_week";
export const UNLIMITED_WEEK_LINE = `Unlimited ads and Studio videos for ${UNLIMITED_WEEK_DAYS} days, one at a time. One payment, nothing renews.`;

/** The pass is running for this workspace (never while suspended). */
export function unlimitedPassActive(ws: Pick<PlanCheckWorkspace, "unlimitedUntil" | "suspendedAt">, now: Date = new Date()): boolean {
  return Boolean(ws.unlimitedUntil && ws.unlimitedUntil > now && !ws.suspendedAt);
}

/** Pure: new pass end after buying one more week (stacks on a running pass). */
export function extendUnlimitedUntil(current: Date | null | undefined, now: Date, days: number = UNLIMITED_WEEK_DAYS): Date {
  const from = current && current > now ? current : now;
  return new Date(from.getTime() + days * 86_400_000);
}

/** Who may buy the pass: an active paid plan, not suspended, while it is for sale. */
export function canBuyUnlimitedWeek(ws: PlanCheckWorkspace): boolean {
  return UNLIMITED_WEEK_FOR_SALE && ws.adsPlan !== "trial" && ws.adsPlan !== "none" && activeOn(ws);
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
  return plan.annualPriceEnv ? env[plan.annualPriceEnv] || null : null;
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

/** The name to show buyers (displayName, else name). */
export function planDisplayName(p: Pick<AdsPlanTier, "name" | "displayName">): string {
  return p.displayName ?? p.name;
}

export function getPlan(key: string): AdsPlanTier | undefined {
  return ADS_PLANS.find((p) => p.key === key);
}

export function getTopup(key: string): AdsTopupPack | undefined {
  return key === UNLOCK_PACK.key ? UNLOCK_PACK : key === UNLIMITED_WEEK.key ? UNLIMITED_WEEK : ADS_TOPUPS.find((t) => t.key === key);
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
export type AdsOfferKey = "launch_department" | "launch_quarter" | "autopilot_launch";

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

/** Growth Autopilot first month: $97, then the founding $297/month. */
export const AUTOPILOT_FIRST_MONTH_CENTS = 9700;
/** The coupon takes this much off the first autopilot invoice (renewals are plain $297 invoices). */
export const AUTOPILOT_LAUNCH_OFF_CENTS = AUTOPILOT_PRICE_CENTS - AUTOPILOT_FIRST_MONTH_CENTS;
/** Days after the free pack finishes that the autopilot first-month price can be bought (server-enforced). */
export const AUTOPILOT_LAUNCH_WINDOW_DAYS = 7;
export const AUTOPILOT_LAUNCH_COUPON_ENV = "STRIPE_ADS_AUTOPILOT_LAUNCH_COUPON_ID";

/**
 * The small first yes for the done-for-you plan (2026-11-26): Growth Autopilot's first month for $97 via a once
 * coupon on the plan's own $297 price. Only for workspaces with a finished free pack, for 7 days after it finishes,
 * once per workspace (src/lib/ads/autopilot-launch.ts); the founding-spot cap still applies at checkout.
 */
export const AUTOPILOT_LAUNCH: AdsLaunchOffer = {
  key: "autopilot_launch",
  name: "Growth Autopilot first month",
  priceCents: AUTOPILOT_PRICE_CENTS,
  intervalMonths: 1,
  creditsPerPeriod: 0,
  firstPeriodBonus: 0,
  plan: "autopilot",
  windowHours: AUTOPILOT_LAUNCH_WINDOW_DAYS * 24,
  priceEnv: "STRIPE_ADS_AUTOPILOT_PRICE_ID",
  couponEnv: AUTOPILOT_LAUNCH_COUPON_ENV,
  firstPaymentCents: AUTOPILOT_FIRST_MONTH_CENTS,
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

const ALL_OFFERS: readonly AdsLaunchOffer[] = [LAUNCH_QUARTER, AUTOPILOT_LAUNCH, LAUNCH_QUARTER_LEGACY];

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

/** Founder-granted extension (AdsEvent offer_extended): reopens the launch offer until `until`, never shortens it. */
export function withOfferExtension(base: { open: boolean; expiresAt: Date | null }, until: Date | null | undefined, now: Date): { open: boolean; expiresAt: Date | null } {
  if (!until || until <= now || (base.expiresAt && base.expiresAt >= until)) return base;
  return { open: true, expiresAt: until };
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

/**
 * "Nx Starter" plans show members a usage bar, never the credit number (owner decision 2026-11-13).
 * percentLeft = balance vs the plan's monthly grant, clamped 0..100 (top-ups can push the balance over the grant).
 * null = show the plain credit count (Starter, legacy plans, trial).
 */
export function usageMeter(planKey: string, balance: number): { percentLeft: number; label: string } | null {
  // (An active Unlimited week is shown by the callers instead of this bar.)
  const p = getPlan(planKey);
  if (!p?.usageMultiple || p.monthlyCredits <= 0) return null;
  const raw = Math.round((Math.max(0, balance) / p.monthlyCredits) * 100);
  const percentLeft = Math.min(100, balance > 0 ? Math.max(1, raw) : 0);
  return { percentLeft, label: percentLeft === 0 ? "This month's usage is used up" : `${percentLeft}% of this month's usage left` };
}

/** One plain line on a plan's usage: "20x Starter usage ..." for multiple plans (no credit count), else the credits. */
export function planUsageLine(p: Pick<AdsPlanTier, "usageMultiple" | "monthlyCredits">): string {
  return p.usageMultiple ? `${p.usageMultiple}x Starter usage for ads and Studio videos` : `${p.monthlyCredits} credits / month`;
}

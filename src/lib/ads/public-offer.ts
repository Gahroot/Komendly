// The public facts about the ads offer, in one place, for every public surface (llms.txt, JSON-LD, pricing hero,
// homepage, metadata, assistant listings). Everything is derived from billing-config and the free-pack limit, so a
// price or pack-size change shows up everywhere. Pure: safe to import from client components.
// Flagship offer (prd.md §1-§4, split 2026-11-22): hire Ozzy's AI Marketing Team = Growth Autopilot (done for you,
// founding price, 10 founding spots). Ozzy Ad Department is the do-it-yourself plan (fresh ads every week + a coach;
// the owner posts them). Every claim here is work the product really does; never promise lead numbers, sales or ROI.
import { annualPriceCents, AUTOPILOT_FIRST_MONTH_CENTS, AUTOPILOT_FOUNDING_LINE, AUTOPILOT_LAUNCH, AUTOPILOT_FOUNDING_SPOTS, AUTOPILOT_REGULAR_PRICE_CENTS, getPlan, LAUNCH_QUARTER, offerFirstPaymentCents, planDisplayName, PLANS_FOR_SALE, UNLOCK_PACK, type AdsPlanTier } from "./billing-config";
export { AUTOPILOT_FIRST_MONTH_CENTS };
import { FREE_TRIAL_ADS, REFERRED_FREE_TRIAL_ADS } from "./bonus-access";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** The plan the public pages lead with (autopilot: Growth Autopilot, sold as Ozzy's AI Marketing Team). */
export const HERO_PLAN: AdsPlanTier = PLANS_FOR_SALE.find((p) => p.recommended) ?? getPlan("autopilot")!;
/** The do-it-yourself plan (ad_department: Ozzy Ad Department), sold with the $97 first-month launch offer. */
export const DIY_PLAN: AdsPlanTier = getPlan(LAUNCH_QUARTER.plan)!;

/** The headline promise (prd.md §1). */
export const HERO_HEADLINE = "A steady flow of customers asking for quotes, without you running Facebook ads";
/** The outcome the hero plan is sold on (lead with this, not with the feature list). Full sentences. */
export const HERO_OUTCOME = "We run your Facebook and Instagram ads for you and email every lead to you within minutes. Ads that waste money get paused, fresh ones are added every week, and you do nothing but set one budget and read one email a week.";

export const PUBLIC_OFFER = {
  freeAds: FREE_TRIAL_ADS,
  referredFreeAds: REFERRED_FREE_TRIAL_ADS,
  unlockPrice: usd(UNLOCK_PACK.priceCents),
  heroName: planDisplayName(HERO_PLAN),
  /** "Growth Autopilot". */
  heroPlanName: HERO_PLAN.name,
  /** Founding price, locked while subscribed. */
  heroPrice: usd(HERO_PLAN.priceCents),
  /** Standard price, shown as the regular price. */
  heroRegularPrice: usd(AUTOPILOT_REGULAR_PRICE_CENTS),
  foundingSpots: AUTOPILOT_FOUNDING_SPOTS,
  diyName: planDisplayName(DIY_PLAN),
  diyPrice: usd(DIY_PLAN.priceCents),
  diyFirstMonth: usd(offerFirstPaymentCents(LAUNCH_QUARTER)),
  /** Hours after the free ads are ready that the Ad Department first-month price can be bought (server-enforced). */
  launchWindowHours: LAUNCH_QUARTER.windowHours,
} as const;

/** "10 free ads from your website, no card needed (20 if a friend's referral link sent you)". */
export const FREE_PACK_LINE = `${FREE_TRIAL_ADS} free ads from your website, no card needed (${REFERRED_FREE_TRIAL_ADS} if a friend's referral link sent you)`;
/** "$9 'Unlock this pack' unlocks the rest of the pack, once". */
export const UNLOCK_LINE = `The rest of the pack unlocks with any plan or a one-time ${PUBLIC_OFFER.unlockPrice} "${UNLOCK_PACK.name}"`;
/** "Ozzy's AI Marketing Team (Growth Autopilot): $297/month founding price, locked ... (regular price $497/month)". */
export const HERO_PRICE_LINE = `${PUBLIC_OFFER.heroName} (${PUBLIC_OFFER.heroPlanName}): ${PUBLIC_OFFER.heroPrice}/month founding price, locked for as long as you stay subscribed (regular price ${PUBLIC_OFFER.heroRegularPrice}/month)`;
/** "Founding spots: 10 businesses. We set up your Meta connection with you when you join." */
export const FOUNDING_SPOTS_LINE = AUTOPILOT_FOUNDING_LINE;
/** What the hero plan includes, in plain words (lower-case phrase, used mid-sentence). */
export const HERO_INCLUDES = "fresh ads every week, launched and run for you as Facebook and Instagram lead ads in your own Meta account, daily checks that pause ads wasting money, every lead emailed to you within minutes, and a weekly plain-English report";
/** "Ozzy Ad Department: $97 the first month, then $197/month" (the first month only within the launch window). */
export const DIY_PRICE_LINE = `${PUBLIC_OFFER.diyName}: ${PUBLIC_OFFER.diyFirstMonth} the first month, then ${PUBLIC_OFFER.diyPrice}/month`;
/** What the DIY plan includes (lower-case phrase). No claim that we launch or run ads. */
export const DIY_INCLUDES = "fresh ads made from your website every week, and a coach that tells you what's working; you post them yourself";

/** Ad spend, always stated next to the offer. */
export const AD_SPEND_LINE = "Ad spend is paid by you directly to Meta, never through Komendly, and never goes over the monthly limit you set.";
/** No-guarantee line, always stated next to the offer. */
export const NO_GUARANTEE_LINE = "We can't promise a number of leads or sales: that depends on your offer, your area and your market.";
/** How the Ad Department first-month price really works (the launch coupon, only inside the window after the free ads). */
export const LAUNCH_PRICE_NOTE = `${PUBLIC_OFFER.diyFirstMonth} first month: start within ${PUBLIC_OFFER.launchWindowHours} hours of getting your free ads.`;

/**
 * The terms shown next to every checkout button (auto-renewal disclosure): price, renewal, cancel path, ad spend.
 * `firstPaymentCents` = what today's checkout charges when it differs from the plan price (launch coupon).
 */
export function checkoutTerms(plan: Pick<AdsPlanTier, "priceCents">, opts: { yearly?: boolean; firstPaymentCents?: number } = {}): string {
  const renew = opts.yearly ? `${usd(annualPriceCents(plan as AdsPlanTier))}/year, renews yearly` : `${usd(plan.priceCents)}/month, renews monthly`;
  const today = opts.firstPaymentCents !== undefined && !opts.yearly ? `${usd(opts.firstPaymentCents)} today, then ` : "";
  return `${today}${renew}. Cancel anytime online. Ad spend is paid to Meta separately.`;
}

/** The team: role labels for real jobs the system does (prd.md §4). Ozzy is the only character. */
export const HERO_TEAM: readonly { role: string; does: string }[] = [
  { role: "Ozzy, your point of contact", does: "Sends you a plain-English report every week and tells you when he needs you, like when Meta needs reconnecting." },
  { role: "Learns your business", does: "Reads your website to learn what you sell, who you serve and the questions to ask new customers." },
  { role: "Makes your ads", does: "Writes and designs fresh ads every week from your own website, logo and colors." },
  { role: "Puts them live, inside your limit", does: "Sets up and turns on your Facebook and Instagram lead ads with you, and keeps spend inside your monthly limit." },
  { role: "Pauses what wastes money", does: "Checks results every day, pauses ads that waste money and keeps the ones that work." },
  { role: "Sends you the leads", does: "Emails you each new inquiry within minutes, so you can call them back fast." },
];

/** What the owner does (prd.md §3). Meta is connected with us when they join: no self-serve claim. */
export const OWNER_STEPS: readonly string[] = [
  "Join, and we set up your Facebook and Instagram (Meta) connection with you",
  "Set a monthly ad budget limit",
  "Read the weekly report",
  "Call your leads",
];

// ---- Growth Autopilot first month (the small first yes for the done-for-you plan, 2026-11-26) ----
/** "$97 your first month, then $297/month". The first month price is server-enforced: finished free pack, 7 days, once. */
export const AUTOPILOT_FIRST_MONTH_LINE = `${usd(AUTOPILOT_FIRST_MONTH_CENTS)} your first month, then ${usd(HERO_PLAN.priceCents)}/month`;
/** Days after the free pack finishes that the first-month price can be bought. */
export const AUTOPILOT_LAUNCH_WINDOW_DAYS = AUTOPILOT_LAUNCH.windowHours / 24;
/** The window, as words (always stated next to the first-month price). */
export const AUTOPILOT_LAUNCH_NOTE = `${usd(AUTOPILOT_FIRST_MONTH_CENTS)} first month: start within ${AUTOPILOT_LAUNCH_WINDOW_DAYS} days of getting your free ads.`;
/**
 * Risk reversal on OUR work, never on their results. True to the system: Meta must be connected WITH the owner, so
 * the 7 days start when they connect it. The 30-day full refund is the existing self-refund (api/ads-billing/self-refund).
 */
export const AUTOPILOT_GUARANTEE_LINE = "Your ads are live in your Facebook account within 7 days of you connecting Meta, or your first month is refunded. And you still have our 30-day full refund. We can't promise leads or sales.";
/**
 * The downsell: shown ONLY after "not now" on the done-for-you offer. Different terms and features (you post the ads
 * yourself), not a cheaper Autopilot. Same price as the Ad Department launch offer today.
 */
export const DIY_STEP_DOWN = {
  /** When it may be shown. */
  shownAfter: "autopilot_not_now",
  name: PUBLIC_OFFER.diyName,
  priceLine: DIY_PRICE_LINE,
  firstMonth: PUBLIC_OFFER.diyFirstMonth,
  monthly: PUBLIC_OFFER.diyPrice,
  headline: "Prefer to post them yourself?",
  /** What changes versus the done-for-you plan. */
  terms: `${DIY_INCLUDES}. We don't launch or run your ads.`,
} as const;

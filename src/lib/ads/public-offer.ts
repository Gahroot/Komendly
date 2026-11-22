// The public facts about the ads offer, in one place, for every public surface (llms.txt, JSON-LD, pricing hero,
// homepage, metadata, assistant listings). Everything is derived from billing-config and the free-pack limit, so a
// price or pack-size change shows up everywhere. Pure: safe to import from client components.
// Flagship offer (prd.md §1-§4): hire Ozzy's AI Marketing Team. Every claim here is work the product really does;
// never promise lead numbers, sales or ROI.
import { annualPriceCents, getPlan, LAUNCH_QUARTER, offerFirstPaymentCents, planDisplayName, PLANS_FOR_SALE, UNLOCK_PACK, type AdsPlanTier } from "./billing-config";
import { FREE_TRIAL_ADS, REFERRED_FREE_TRIAL_ADS } from "./bonus-access";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** The plan the public pages lead with (ad_department, sold as Ozzy's AI Marketing Team). */
export const HERO_PLAN: AdsPlanTier = PLANS_FOR_SALE.find((p) => p.recommended) ?? getPlan(LAUNCH_QUARTER.plan)!;

/** The headline promise (prd.md §1). */
export const HERO_HEADLINE = "Hire Ozzy's AI Marketing Team";
/** The outcome the hero plan is sold on (lead with this, not with the feature list). Full sentences. */
export const HERO_OUTCOME = "They make your ads, launch your campaigns and keep working to bring you more customers. You run your business. Ozzy runs your marketing.";

export const PUBLIC_OFFER = {
  freeAds: FREE_TRIAL_ADS,
  referredFreeAds: REFERRED_FREE_TRIAL_ADS,
  unlockPrice: usd(UNLOCK_PACK.priceCents),
  heroName: planDisplayName(HERO_PLAN),
  heroPrice: usd(HERO_PLAN.priceCents),
  heroFirstMonth: usd(LAUNCH_QUARTER.plan === HERO_PLAN.key ? offerFirstPaymentCents(LAUNCH_QUARTER) : HERO_PLAN.priceCents),
  /** Hours after the free ads are ready that the first-month price can be bought (server-enforced). */
  launchWindowHours: LAUNCH_QUARTER.windowHours,
} as const;

/** "10 free ads from your website, no card needed (20 if a friend's referral link sent you)". */
export const FREE_PACK_LINE = `${FREE_TRIAL_ADS} free ads from your website, no card needed (${REFERRED_FREE_TRIAL_ADS} if a friend's referral link sent you)`;
/** "$9 'Unlock this pack' unlocks the rest of the pack, once". */
export const UNLOCK_LINE = `The rest of the pack unlocks with any plan or a one-time ${PUBLIC_OFFER.unlockPrice} "${UNLOCK_PACK.name}"`;
/** "Ozzy's AI Marketing Team: $97 the first month, then $197/month". */
export const HERO_PRICE_LINE = `${PUBLIC_OFFER.heroName}: ${PUBLIC_OFFER.heroFirstMonth} the first month, then ${PUBLIC_OFFER.heroPrice}/month`;
/** What the hero plan includes, in plain words (lower-case phrase, used mid-sentence). */
export const HERO_INCLUDES = "fresh ads every week, launched and run for you as Facebook and Instagram lead ads in your own Meta account, daily checks that pause ads wasting money, every lead emailed to you within minutes, and a weekly plain-English report";

/** Ad spend, always stated next to the offer. */
export const AD_SPEND_LINE = "Ad spend is paid by you directly to Meta, never through Komendly, and never goes over the monthly limit you set.";
/** No-guarantee line, always stated next to the offer. */
export const NO_GUARANTEE_LINE = "We can't promise a number of leads or sales: that depends on your offer, your area and your market.";
/** How the first-month price really works (it's the launch coupon, only inside the window after the free ads). */
export const LAUNCH_PRICE_NOTE = `${PUBLIC_OFFER.heroFirstMonth} first month: hire the team within ${PUBLIC_OFFER.launchWindowHours} hours of getting your free ads.`;

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
  { role: "Ozzy, Marketing Director", does: "Sends you a plain-English report every week and tells you when he needs you, like when Meta needs reconnecting." },
  { role: "Research & Strategy", does: "Reads your website to learn what you sell, who you serve and the questions to ask new customers." },
  { role: "Creative Studio", does: "Writes and designs fresh ads every week, guided by what's working." },
  { role: "Launch & Budget Desk", does: "Sets up and turns on your Facebook and Instagram lead ads, and keeps spend inside your monthly limit." },
  { role: "Performance Analyst", does: "Checks results every day, pauses ads that waste money and keeps the ones that work." },
  { role: "Lead Desk", does: "Emails you each new inquiry within minutes, so you can call them back fast." },
];

/** What the owner does (prd.md §3). */
export const OWNER_STEPS: readonly string[] = [
  "Connect your Facebook and Instagram account once",
  "Set a monthly ad budget limit",
  "Read the weekly report",
  "Call your leads",
];

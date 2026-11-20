// The public facts about the ads offer, in one place, for every public surface (llms.txt, JSON-LD, pricing hero,
// homepage, metadata, assistant listings). Everything is derived from billing-config and the free-pack limit, so a
// price or pack-size change shows up everywhere. Pure: safe to import from client components.
import { getPlan, LAUNCH_QUARTER, offerFirstPaymentCents, PLANS_FOR_SALE, UNLOCK_PACK, type AdsPlanTier } from "./billing-config";
import { FREE_TRIAL_ADS, REFERRED_FREE_TRIAL_ADS } from "./bonus-access";

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** The plan the public pages lead with (Ozzy Ad Department). */
export const HERO_PLAN: AdsPlanTier = PLANS_FOR_SALE.find((p) => p.recommended) ?? getPlan(LAUNCH_QUARTER.plan)!;

/** The outcome the hero plan is sold on (lead with this, not with the feature list). */
export const HERO_OUTCOME = "Your ads go live in your own Meta account and the losers get replaced every week.";

export const PUBLIC_OFFER = {
  freeAds: FREE_TRIAL_ADS,
  referredFreeAds: REFERRED_FREE_TRIAL_ADS,
  unlockPrice: usd(UNLOCK_PACK.priceCents),
  heroName: HERO_PLAN.name,
  heroPrice: usd(HERO_PLAN.priceCents),
  heroFirstMonth: usd(LAUNCH_QUARTER.plan === HERO_PLAN.key ? offerFirstPaymentCents(LAUNCH_QUARTER) : HERO_PLAN.priceCents),
} as const;

/** "3 free ads from your website, no card (20 through a friend's referral link)". */
export const FREE_PACK_LINE = `${FREE_TRIAL_ADS} free ads from your website, no card needed (${REFERRED_FREE_TRIAL_ADS} if a friend's referral link sent you)`;
/** "$9 'Unlock this pack' unlocks the rest of the pack, once". */
export const UNLOCK_LINE = `The rest of the pack unlocks with any plan or a one-time ${PUBLIC_OFFER.unlockPrice} "${UNLOCK_PACK.name}"`;
/** "Ozzy Ad Department: $97 the first month, then $197/month". */
export const HERO_PRICE_LINE = `${PUBLIC_OFFER.heroName}: ${PUBLIC_OFFER.heroFirstMonth} the first month, then ${PUBLIC_OFFER.heroPrice}/month`;
/** What the hero plan includes, in plain words. */
export const HERO_INCLUDES = "6 fresh ads every Monday and Ozzy Ad Coach, who tells you what to keep and what to kill";

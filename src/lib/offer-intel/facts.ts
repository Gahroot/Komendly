// The only facts experiment copy may state. Derived from public-offer.ts / billing-config.ts, so a price change there
// changes what is allowed here. Pure TS: imported by web and engine (engine Dockerfile copies this folder).
import { AUTOPILOT_FIRST_MONTH_CENTS, AUTOPILOT_GUARANTEE_LINE, AUTOPILOT_LAUNCH_WINDOW_DAYS, PUBLIC_OFFER } from "../ads/public-offer";
import { UNLOCK_PACK } from "../ads/billing-config";

const dollars = (cents: number) => `$${cents / 100}`;

/** Tokens a variant may use; they are replaced with the real value at render time. Literal copies are checked too. */
export const FACT_TOKENS: Readonly<Record<string, string>> = {
  "{first}": dollars(AUTOPILOT_FIRST_MONTH_CENTS),
  "{monthly}": PUBLIC_OFFER.heroPrice,
  "{regular}": PUBLIC_OFFER.heroRegularPrice,
  "{unlock}": dollars(UNLOCK_PACK.priceCents),
  "{diyFirst}": PUBLIC_OFFER.diyFirstMonth,
  "{diyMonthly}": PUBLIC_OFFER.diyPrice,
  "{freeAds}": String(PUBLIC_OFFER.freeAds),
  "{spots}": String(PUBLIC_OFFER.foundingSpots),
};

/** Dollar amounts that exist in the offer. Any other $ figure in copy = a price change/invention. */
export const ALLOWED_PRICES: ReadonlySet<string> = new Set<string>([...Object.entries(FACT_TOKENS).filter(([k]) => !["{freeAds}", "{spots}"].includes(k)).map(([, v]) => v)]);
/** Plain numbers that exist in the offer (free ads, referred ads, refund/window days, founding spots) plus 1-3 as in "one budget". */
export const ALLOWED_PLAIN_NUMBERS: ReadonlySet<number> = new Set([1, 2, 3, PUBLIC_OFFER.freeAds, PUBLIC_OFFER.referredFreeAds, PUBLIC_OFFER.foundingSpots, 30, AUTOPILOT_LAUNCH_WINDOW_DAYS]);
/** Guarantee sentences that already exist; any other refund/guarantee wording is a new guarantee. */
export const APPROVED_GUARANTEE_TEXTS: readonly string[] = [
  AUTOPILOT_GUARANTEE_LINE,
  "Cancel anytime online, and the first 30 days come with a full refund.",
  "Not happy with our work in your first 30 days? Full refund.",
  "30-day full refund",
  "Cancel anytime",
];

export function fillTokens(s: string): string {
  let out = s;
  for (const [k, v] of Object.entries(FACT_TOKENS)) out = out.split(k).join(v);
  return out;
}

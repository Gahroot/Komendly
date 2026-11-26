// Offer order for trade workspaces (roofers first): Hormozi's money model, main offer before the downsells.
// 1. Growth Autopilot (plan `autopilot`) the moment the ads are ready; 2. only after they decline it, Ozzy Ad
// Department ($97 first month, the Launch Quarter offer); 3. last, the $9 "Unlock this pack". Pure: client-safe.
import { AUTOPILOT_FOUNDING_SPOTS, AUTOPILOT_PRICE_CENTS, AUTOPILOT_REGULAR_PRICE_CENTS, getPlan, isPlanForSale } from "./billing-config";
import { ROOFERS } from "./trade";

export const AUTOPILOT_PLAN_KEY = "autopilot";
/** Checkout + AdsEvent placement for the Growth Autopilot offer card. */
export const AUTOPILOT_PLACEMENT = "autopilot_offer";

/** Trades whose trial runs lead with Growth Autopilot. Every other workspace keeps the default flow. */
export function usesAutopilotOffer(trade: string | null | undefined): boolean {
  return trade === ROOFERS;
}

export type RooferOfferStage = "none" | "autopilot" | "launch_quarter" | "unlock_pack";

/**
 * One offer at a time on a roofer trial run: nothing until `minReady` ads are ready; Growth Autopilot while it can be
 * bought and they haven't declined it; then the Ad Department launch offer while its window is open and not dismissed;
 * then the $9 unlock while bonus ads are locked.
 */
export function rooferOfferStage(a: { trialUnpaid: boolean; readyAds: number; minReady: number; autopilotAvailable: boolean; autopilotDeclined: boolean; launchOpen: boolean; launchDismissed: boolean; bonusLocked: boolean; unlockAvailable: boolean }): RooferOfferStage {
  if (!a.trialUnpaid || a.readyAds < a.minReady) return "none";
  if (a.autopilotAvailable && !a.autopilotDeclined) return "autopilot";
  if (a.launchOpen && !a.launchDismissed) return "launch_quarter";
  return a.bonusLocked && a.unlockAvailable ? "unlock_pack" : "none";
}

/** Founding (what they pay, locked while they stay) and regular monthly price, in cents. */
export function autopilotPrices(): { foundingCents: number; regularCents: number } {
  return { foundingCents: getPlan(AUTOPILOT_PLAN_KEY)?.priceCents ?? AUTOPILOT_PRICE_CENTS, regularCents: AUTOPILOT_REGULAR_PRICE_CENTS };
}

export function autopilotForSale(): boolean {
  return isPlanForSale(AUTOPILOT_PLAN_KEY);
}

const usd = (cents: number) => `$${Math.round(cents / 100)}`;

/** Main offer copy (handoff §2, founder decisions 2026-11-22). No lead counts, results or guarantees of outcome. */
export function autopilotOfferCopy(spotsLeft: number | null = null) {
  const { foundingCents, regularCents } = autopilotPrices();
  return {
    title: "Want us to put these live and send you the leads?",
    intro: "We run your Facebook and Instagram ads so you don't have to. Founding offer, roofing companies only.",
    features: [
      "Worried you can't run ads? We run them, in your own Meta ad account. You own the account and every lead.",
      "Worried Facebook is complicated? We set up the connection with you when you join.",
      "Worried about wasting money? Ads that waste money get paused daily, and spend never goes over the monthly limit you set. You pay Meta directly.",
      "Worried the ads look generic? Every ad is made from your own website, logo and colors, and you've already seen them.",
      "Worried about missed calls? Each new lead is emailed to you within minutes, and fresh ads are added every week.",
      "Worried about the time? One budget to set and one weekly email to read.",
    ],
    price: `${usd(foundingCents)}/month`,
    priceNote: `Founding price, locked while you stay. Regular price ${usd(regularCents)}/month.`,
    scarcity: `First ${AUTOPILOT_FOUNDING_SPOTS} roofing companies only${spotsLeft !== null && spotsLeft < AUTOPILOT_FOUNDING_SPOTS ? ` (${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left)` : ""}.`,
    guarantee: "Not happy with our work in your first 30 days? Full refund.",
    cta: `Join for ${usd(foundingCents)}/month`,
  };
}

export function offerHonestyText(): string {
  const c = autopilotOfferCopy();
  return [c.title, c.intro, ...c.features, c.price, c.priceNote, c.scarcity, c.guarantee, c.cta].join("\n");
}

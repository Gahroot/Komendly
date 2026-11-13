// Launch offer value stack: every line is computed from billing-config, nothing invented. Pure.
import { AD_DEPARTMENT_STACK, type AdsLaunchOffer, getPlan, LAUNCH_QUARTER, offerFirstPaymentCents, offerSavingsCents, stackTotalUsd } from "./billing-config";
import { bonusLabel, type BonusSummary } from "./bonus-access";

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Price per credit (1 credit = 1 single-size ad) for the offer vs the plan it is based on, in cents. */
export function offerPerAdCents(offer: AdsLaunchOffer = LAUNCH_QUARTER): { offer: number; plan: number } {
  const plan = getPlan(offer.plan);
  return {
    offer: offer.creditsPerPeriod > 0 ? Math.round(offer.priceCents / offer.creditsPerPeriod) : 0,
    plan: plan && plan.monthlyCredits > 0 ? Math.round(plan.priceCents / plan.monthlyCredits) : 0,
  };
}

export function launchQuarterValueStack(bonus: BonusSummary | null, offer: AdsLaunchOffer = LAUNCH_QUARTER): string[] {
  const plan = getPlan(offer.plan);
  if (plan?.unlimited) {
    // Hormozi stack: stated value per line, then the price today.
    const lines = AD_DEPARTMENT_STACK.map((i) => `${i.bonus ? "Bonus: " : ""}${i.label}: ${i.detail} (worth $${i.valueUsd}/month)`);
    if (bonus?.locked) lines.push(`Unlocks your ${bonusLabel(bonus)} right away`);
    lines.push(`Total value $${stackTotalUsd().toLocaleString("en-US")}/month. Your first month: ${usd(offerFirstPaymentCents(offer))} (save ${usd(offerSavingsCents(offer))}), then ${usd(plan.priceCents)}/month`);
    lines.push("Post Ozzy's ads for 30 days. Not happy? One click, full refund.");
    return lines;
  }
  const per = offerPerAdCents(offer);
  const lines = [
    `${offer.creditsPerPeriod} new ads every ${offer.intervalMonths} months (1 credit = 1 ad)`,
    `+${offer.firstPeriodBonus} bonus credits on your first payment`,
    `${usd(per.offer)} per ad vs ${usd(per.plan)} on ${plan?.name ?? "monthly"}: save ${usd(offerSavingsCents(offer))} over ${offer.intervalMonths} months`,
    "Stories/Reels 9:16 versions, all 5 awareness levels, animated ads",
  ];
  if (bonus?.locked) lines.push(`Unlocks your ${bonusLabel(bonus)} right away`);
  lines.push("30-day money-back guarantee on your first payment");
  return lines;
}

/** "71h 12m" / "12m 05s" countdown text; empty when expired. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Download-moment modal: once per run, and at most `sessionCap` modals per browser session. */
export function shouldShowOfferModal(args: { shownForRun: boolean; shownThisSession: number; sessionCap?: number; offerOpen: boolean }): boolean {
  return args.offerOpen && !args.shownForRun && args.shownThisSession < (args.sessionCap ?? 1);
}

/**
 * Offer UI on a trial run may only render (and send its "shown" events) once the workspace and the server's Launch
 * Quarter state are loaded. Rendering earlier showed "no Launch Quarter" to users inside the window and logged
 * upsell_shown launchOffer:false / locked_bonus_shown offerOpen:false (run cmwc7iamu00066ur5udk9p0vo, 2026-11-11).
 */
export function offerStateSettled(args: { isTrial: boolean; workspaceLoaded: boolean; isPaid: boolean; offerSettled: boolean }): boolean {
  if (!args.isTrial) return true;
  if (!args.workspaceLoaded) return false;
  return args.isPaid || args.offerSettled;
}

export type TrialOfferStage = "none" | "launch_quarter" | "unlock_pack";

/**
 * One offer at a time on a trial run: nothing before LAUNCH_OFFER_MIN_READY ads are ready; the Launch Quarter while its
 * window is open and not dismissed; then the $9 "Unlock this pack" downsell, only while bonus ads are locked.
 */
export function trialOfferStage(args: { trialUnpaid: boolean; readyAds: number; minReady: number; launchOpen: boolean; launchDismissed: boolean; bonusLocked: boolean; unlockAvailable: boolean }): TrialOfferStage {
  if (!args.trialUnpaid || args.readyAds < args.minReady) return "none";
  if (args.launchOpen && !args.launchDismissed) return "launch_quarter";
  return args.bonusLocked && args.unlockAvailable ? "unlock_pack" : "none";
}

/** What a freelancer would conservatively charge per ad, in USD (the /free-ads page cites $15-60 per static; motion costs most). */
export const FREELANCER_PRICE_USD = { static: 35, motion: 150 } as const;

/** Minimum ready ads before the value line shows. */
export const FREELANCER_VALUE_MIN_ADS = 3;

/**
 * One honest anchor line from the ads they actually have ready, e.g. "A freelancer would charge about $500 for these 11 ads."
 * Rounded down to a clean number ($50 steps, $10 under $100); null under FREELANCER_VALUE_MIN_ADS ads.
 */
export function freelancerValueLine(ready: { static: number; motion: number }): string | null {
  const n = ready.static + ready.motion;
  if (n < FREELANCER_VALUE_MIN_ADS) return null;
  const raw = ready.static * FREELANCER_PRICE_USD.static + ready.motion * FREELANCER_PRICE_USD.motion;
  const step = raw >= 100 ? 50 : 10;
  const total = Math.floor(raw / step) * step;
  return `A freelancer would charge about $${total.toLocaleString("en-US")} for these ${n} ads.`;
}

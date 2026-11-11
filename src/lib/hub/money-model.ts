// One Ozzy money model across all three apps (goal ezmotionkom). Client-safe (pure data).
// Hormozi sequence: Attraction -> Upsell (at peak value) -> Downsell -> Continuity.
//
// ONE wallet: Ozzy credits in the workspace ledger (CreditLedger), spent by Ad Packs (1/static ad, 5/motion ad)
// and Ozzy Studio (5-8/new video, revisions per src/lib/studio/contracts.ts STUDIO_PRICE).
// Testimonial videos are SCARCE: never paid with credits. Only Scale (1/mo) and Agency (3/mo) include them
// (granted as testimonial minutes on User via the ads billing webhook), plus expensive one-off packs.
// Real cost: ~$4.2-4.9 per 30s testimonial (FAL) vs ~$0.27-0.53 per credit at list (pennies on Codex).
//
// Plans/prices are the EXISTING Stripe ads plans (no new subscription prices). Existing testimonial
// subscribers (User.plan starter/pro/enterprise) are grandfathered: shown as "Legacy testimonials plan" in the hub,
// with a one-click switch offer to an Ozzy plan.
import { ADS_PLANS, type AdsPlanKey } from "../ads/billing-config";

/** Testimonial videos (1 video = up to 60s = 1 testimonial minute) included per month by plan. */
export const TESTIMONIALS_PER_MONTH: Record<AdsPlanKey, number> = { starter: 0, growth: 0, scale: 1, agency: 3 };

/** Attraction offers (free, no card). */
export const ATTRACTION = {
  adPack: "10 static ads + 1 animated ad from your website",
  studio: "1 free Ozzy Studio video, no watermark, made by chatting with Ozzy",
  studioInvite: "Give a friend 2 free Studio videos; get 1 more free video when they join",
} as const;

/**
 * Studio launch offer (upsell at peak value): shown for 72h after the first free Studio video is delivered
 * (AdsWorkspace.studioOfferReadyAt). = the existing Growth monthly price + 25 bonus credits on the first invoice
 * (CreditReason offer_bonus, stripeRef offer_bonus:<invoiceId>). Checkout metadata offer=studio_launch;
 * the server enforces the window. Guarantee: the existing 30-day money-back on the first month.
 */
export const STUDIO_LAUNCH_OFFER = {
  key: "studio_launch",
  name: "Ozzy Studio Launch",
  plan: "growth" as AdsPlanKey,
  bonusCredits: 25,
  windowHours: 72,
  headline: "Keep Ozzy on your team",
  stack: [
    "55 credits every month: about 10 Studio videos, or 55 ads, mix as you like",
    "+25 bonus credits on your first month (only for the next 72 hours)",
    "Edit your own footage up to 90 seconds, 500 MB uploads",
    "30-day money-back guarantee",
  ],
} as const;

/** Downsells after a declined/cancelled checkout (existing prices): Starter monthly, then the 10-credit top-up. */
export const DOWNSELLS = ["starter", "topup_10"] as const;

/** Display copy for each plan across all apps (pricing page, hub, billing). */
export function planAppsSummary(key: AdsPlanKey): string[] {
  const p = ADS_PLANS.find((x) => x.key === key);
  if (!p) return [];
  const t = TESTIMONIALS_PER_MONTH[key];
  return [
    `${p.monthlyCredits} Ozzy credits / month for Ad Packs and Ozzy Studio`,
    `About ${Math.floor(p.monthlyCredits / 5)} Studio videos or ${p.monthlyCredits} static ads`,
    t > 0 ? `${t} AI testimonial video${t === 1 ? "" : "s"} / month` : "AI testimonial videos: Scale and Agency only",
    "All sizes (4:5, 1:1, 9:16) and animated ads",
  ];
}

export function isStudioLaunchOfferOpen(readyAt: Date | null | undefined, now: Date): boolean {
  if (!readyAt) return false;
  const t = now.getTime() - readyAt.getTime();
  return t >= 0 && t < STUDIO_LAUNCH_OFFER.windowHours * 3_600_000;
}

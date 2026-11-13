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
import { ADS_PLANS, type AdsPlanKey, unlimitedLine } from "../ads/billing-config";

/** Testimonial videos (1 video = up to 60s = 1 testimonial minute) included per month by plan. */
export const TESTIMONIALS_PER_MONTH: Record<AdsPlanKey, number> = { starter: 0, ad_department: 0, growth: 0, scale: 1, agency: 3 };

/** Attraction offers (free, no card). */
export const ATTRACTION = {
  adPack: "10 static ads + 1 animated ad from your website",
  studio: "1 free Ozzy Studio video, no watermark, made by chatting with Ozzy",
  studioInvite: "Give a friend 2 free Studio videos; get 1 more free video when they join",
} as const;

/**
 * Studio launch offer (upsell at peak value): shown for 72h after the first free Studio video is delivered
 * (AdsWorkspace.studioOfferReadyAt). Since 2026-11-11 = the hero plan (Ozzy Ad Department, Founding Unlimited)
 * with the same first-month coupon as the trial launch offer ($100 off: $97 today). bonusCredits = 0: unlimited
 * replaces credits. Checkout metadata offer=studio_launch; the server enforces the window.
 */
export const STUDIO_LAUNCH_OFFER = {
  key: "studio_launch",
  name: "Ozzy Studio Launch",
  plan: "ad_department" as AdsPlanKey,
  bonusCredits: 0,
  windowHours: 72,
  headline: "Keep Ozzy on your team",
  stack: [
    "Unlimited Studio videos and Ad Packs, made one at a time",
    "6 fresh ads every Monday, made for you",
    "Ozzy Ad Coach: he tells you what's working",
    "First month $97 instead of $197 (only for the next 72 hours)",
    "Post Ozzy's ads for 30 days. Not happy? One click, full refund.",
  ],
} as const;

/** Downsells after a declined/cancelled checkout (existing prices): Starter monthly, then the 10-credit top-up. */
export const DOWNSELLS = ["starter", "topup_10"] as const;

/** Display copy for each plan across all apps (pricing page, hub, billing). */
export function planAppsSummary(key: AdsPlanKey): string[] {
  const p = ADS_PLANS.find((x) => x.key === key);
  if (!p) return [];
  const t = TESTIMONIALS_PER_MONTH[key];
  if (p.unlimited) {
    return [
      unlimitedLine(p) ?? "Unlimited Ad Packs and Ozzy Studio videos",
      "6 fresh ads every Monday (5 static + 1 animated), made for you",
      "Ozzy Ad Coach: he tells you what's working and makes more of it",
      t > 0 ? `${t} AI testimonial videos / month` : "AI testimonial videos: Agency only",
    ];
  }
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

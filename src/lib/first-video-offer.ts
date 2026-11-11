// The one-time "First video" offer for the testimonials product. Client-safe (no server imports).

// Pricing is provisional and tuned here (premium launch pricing). 1 video = up to 60 s = 1 minute internally.
export const VIDEO_MAX_SECONDS = 60;

/** Attraction offer (one-time). Key stays "first_video": it is stored in Stripe metadata and analytics. */
export const FIRST_VIDEO_OFFER = {
  key: "first_video",
  name: "Launch Kit",
  priceCents: 9700,
  minutes: 3,
  description: "3 AI video testimonials from your real reviews, up to 60s each",
  /** Only things we actually deliver. */
  bonuses: [
    "Ready-to-post vertical 9:16 MP4s, no watermark",
    "Choice of 24 realistic presenters",
    "Free re-renders until it looks right",
  ],
} as const;

/** Downsell when someone declines the monthly plans at the out-of-minutes gate (credit-pack path). */
export const VIDEO_PACK_OFFER = {
  key: "video_pack",
  name: "5-video pack",
  priceCents: 14700,
  minutes: 5,
} as const;

/** Value anchor shown in copy ("typical creator rates"). */
export const UGC_CREATOR_RATE_USD = { low: 150, high: 300 } as const;

/** Single guarantee line, shown on landing, pricing and checkout. */
export const GUARANTEE = "Looks real or it's free: unlimited re-renders, or a full refund on your Launch Kit within 14 days.";

/** Kept for existing imports; the guarantee is the one promise we make. */
export const RERENDER_PROMISE = GUARANTEE;

/** "3 videos" / "1 video" from a minutes count (1 video = 1 minute). */
export function videosLabel(minutes: number): string {
  return `${minutes} video${minutes === 1 ? "" : "s"}`;
}

/** Per-video price in whole dollars, e.g. "$32". */
export function perVideoUsd(priceCents: number, videos: number): string {
  return formatUsd(Math.round(priceCents / Math.max(1, videos) / 100) * 100);
}

export type FirstVideoOfferKey = typeof FIRST_VIDEO_OFFER.key;

const ACTIVE_STATUSES = ["active", "trialing"] as const;
const UNPAID_PLANS = ["pending", "free"] as const;

export interface OfferEligibilityInput {
  plan: string;
  subscriptionStatus: string;
  stripeSubscriptionId: string | null;
  /** Count of CreditPurchase rows for the user (any prior one-time purchase). */
  purchaseCount: number;
}

export type OfferEligibility = { eligible: true } | { eligible: false; reason: "has_subscription" | "already_purchased" };

/** Eligible = never subscribed to a paid plan right now and never bought anything one-time before. */
export function checkFirstVideoEligibility(input: OfferEligibilityInput): OfferEligibility {
  const hasSubscription =
    (ACTIVE_STATUSES as readonly string[]).includes(input.subscriptionStatus) ||
    !(UNPAID_PLANS as readonly string[]).includes(input.plan) ||
    input.stripeSubscriptionId !== null;
  if (hasSubscription) return { eligible: false, reason: "has_subscription" };
  if (input.purchaseCount > 0) return { eligible: false, reason: "already_purchased" };
  return { eligible: true };
}

export interface AccessInput {
  plan: string;
  subscriptionStatus: string;
  bonusMinutes: number;
  isAdmin?: boolean;
}

/** Who may use the testimonials dashboard: paid subscribers, buyers of minutes (e.g. the first-video offer), admins. */
export function hasTestimonialAccess(user: AccessInput): boolean {
  if (user.isAdmin) return true;
  const subscribed =
    (ACTIVE_STATUSES as readonly string[]).includes(user.subscriptionStatus) && !(UNPAID_PLANS as readonly string[]).includes(user.plan);
  return subscribed || user.bonusMinutes > 0;
}

const LEGACY_PLANS = ["starter", "pro", "enterprise"] as const;

/**
 * Grandfathered testimonial subscriber (goal ezmotionkom): the old testimonial plans (starter/pro/enterprise via
 * src/lib/stripe.ts) stay purchasable/manageable ONLY for them; everyone else buys Ozzy plans (ads billing).
 */
export function isLegacyTestimonialSubscriber(u: { plan: string; subscriptionStatus: string; stripeSubscriptionId: string | null }): boolean {
  if (!(LEGACY_PLANS as readonly string[]).includes(u.plan)) return false;
  return u.stripeSubscriptionId !== null || ["active", "trialing", "past_due"].includes(u.subscriptionStatus);
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

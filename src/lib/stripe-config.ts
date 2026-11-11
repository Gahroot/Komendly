// Stripe configuration - safe to import in client components
// Plan definitions (no Stripe client). Prices are provisional premium launch prices; tune them here.
// 1 video = up to 60 s = 1 minute internally, so `minutesPerMonth` is also videos per month.

/** Yearly = 2 months free. */
const yearly = (monthly: number) => monthly * 10;

// Keys stay starter/pro/enterprise so DB plan values and price-ID env vars keep mapping.
export const PLAN_CONFIG = {
  starter: {
    name: "Growth",
    description: "Turn every new 5-star review into a video",
    monthlyPrice: 197,
    yearlyPrice: yearly(197),
    minutesPerMonth: 10,
    features: ["10 videos a month, up to 60s each", "All 24 presenters", "Ready-to-post 9:16 MP4s", "Free re-renders", "Email support"],
  },
  pro: {
    name: "Pro",
    description: "A steady stream of social proof for every channel",
    monthlyPrice: 497,
    yearlyPrice: yearly(497),
    minutesPerMonth: 30,
    features: ["30 videos a month, up to 60s each", "All 24 presenters", "Ready-to-post 9:16 MP4s", "Free re-renders", "Priority support"],
  },
  enterprise: {
    name: "Agency",
    description: "For agencies running testimonials for many clients",
    monthlyPrice: 997,
    yearlyPrice: yearly(997),
    minutesPerMonth: 80,
    features: ["80 videos a month, up to 60s each", "All 24 presenters", "Ready-to-post 9:16 MP4s", "Free re-renders", "Priority support"],
  },
} as const;

export type PlanKey = keyof typeof PLAN_CONFIG;

/** Minutes for subscribers still on the original (pre-2026-11) Stripe prices. Grandfathered. */
export const LEGACY_PLAN_MINUTES: Record<PlanKey, number> = { starter: 3, pro: 20, enterprise: 60 };

/** Marks subscriptions created on the current prices (subscription metadata). */
export const PLAN_PRICE_VERSION = "v2";

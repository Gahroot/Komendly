import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  typescript: true,
});

// Subscription Plans Configuration (TEST MODE)
export const SUBSCRIPTION_PLANS = {
  starter: {
    name: "Starter",
    productId: "prod_Tgm9MW5OORTI7o",
    prices: {
      monthly: "price_1SjObSKjuiGf4unh0njyorCR",
      yearly: "price_1SjObUKjuiGf4unhZLUdFD0N",
    },
    minutesPerMonth: 3,
    features: [
      "3 minutes of video generation per month",
      "HD quality exports",
      "Basic AI avatars",
      "Email support",
    ],
  },
  pro: {
    name: "Pro",
    productId: "prod_Tgm91way1Wn3Di",
    prices: {
      monthly: "price_1SjObkKjuiGf4unhHjZzjjU0",
      yearly: "price_1SjObrKjuiGf4unhSFMHUvtf",
    },
    minutesPerMonth: 20,
    features: [
      "20 minutes of video generation per month",
      "4K quality exports",
      "Premium AI avatars",
      "Priority support",
      "API access",
    ],
  },
  enterprise: {
    name: "Enterprise",
    productId: "prod_Tgm9N6T05IiC4Z",
    prices: {
      monthly: "price_1SjObuKjuiGf4unhvddauQaz",
      yearly: "price_1SjObwKjuiGf4unhDE4KZvXG",
    },
    minutesPerMonth: 60,
    features: [
      "60 minutes (1 hour) of video generation per month",
      "4K quality exports",
      "All premium AI avatars",
      "Dedicated support",
      "Full API access",
      "Custom integrations",
    ],
  },
} as const;

// Credit purchase configuration
export const CREDIT_PURCHASE = {
  pricePerMinute: 2000, // $20.00 in cents
  minimumMinutes: 1,
  maximumMinutes: 100,
};

// Helper to get plan from price ID
export function getPlanFromPriceId(priceId: string): keyof typeof SUBSCRIPTION_PLANS | null {
  for (const [planKey, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    if (plan.prices.monthly === priceId || plan.prices.yearly === priceId) {
      return planKey as keyof typeof SUBSCRIPTION_PLANS;
    }
  }
  return null;
}

// Helper to get minutes limit from plan
export function getMinutesForPlan(plan: keyof typeof SUBSCRIPTION_PLANS): number {
  return SUBSCRIPTION_PLANS[plan].minutesPerMonth;
}

// Helper to check if a price is yearly
export function isYearlyPrice(priceId: string): boolean {
  for (const plan of Object.values(SUBSCRIPTION_PLANS)) {
    if (plan.prices.yearly === priceId) {
      return true;
    }
  }
  return false;
}

// Map Stripe subscription status to our enum
export function mapStripeStatus(status: Stripe.Subscription.Status): string {
  const statusMap: Record<Stripe.Subscription.Status, string> = {
    incomplete: "incomplete",
    incomplete_expired: "incomplete_expired",
    trialing: "trialing",
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    paused: "paused",
  };
  return statusMap[status] || "incomplete";
}

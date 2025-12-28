// Server-only Stripe utilities
// DO NOT import this file in client components

import Stripe from "stripe";
import { PLAN_CONFIG, type PlanKey } from "./stripe-config";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  typescript: true,
});

// Stripe Price IDs from environment variables
// Configure these in .env.local (test) and production env vars (live)
export const STRIPE_PRICE_IDS = {
  starter: {
    monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID!,
    yearly: process.env.STRIPE_STARTER_YEARLY_PRICE_ID!,
  },
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
    yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID!,
  },
  enterprise: {
    monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID!,
    yearly: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID!,
  },
} as const;

// Stripe Product IDs from environment variables
export const STRIPE_PRODUCT_IDS = {
  starter: process.env.STRIPE_STARTER_PRODUCT_ID!,
  pro: process.env.STRIPE_PRO_PRODUCT_ID!,
  enterprise: process.env.STRIPE_ENTERPRISE_PRODUCT_ID!,
} as const;

// Subscription Plans Configuration (server-side with Stripe IDs)
export const SUBSCRIPTION_PLANS = {
  starter: {
    ...PLAN_CONFIG.starter,
    productId: STRIPE_PRODUCT_IDS.starter,
    prices: STRIPE_PRICE_IDS.starter,
  },
  pro: {
    ...PLAN_CONFIG.pro,
    productId: STRIPE_PRODUCT_IDS.pro,
    prices: STRIPE_PRICE_IDS.pro,
  },
  enterprise: {
    ...PLAN_CONFIG.enterprise,
    productId: STRIPE_PRODUCT_IDS.enterprise,
    prices: STRIPE_PRICE_IDS.enterprise,
  },
} as const;

// Credit purchase configuration
export const CREDIT_PURCHASE = {
  pricePerMinute: 2000, // $20.00 in cents
  minimumMinutes: 1,
  maximumMinutes: 100,
};

// Helper to get plan from price ID
export function getPlanFromPriceId(priceId: string): PlanKey | null {
  for (const [planKey, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    if (plan.prices.monthly === priceId || plan.prices.yearly === priceId) {
      return planKey as PlanKey;
    }
  }
  return null;
}

// Helper to get minutes limit from plan
export function getMinutesForPlan(plan: PlanKey): number {
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

// Get all valid price IDs (for validation)
export function getAllValidPriceIds(): string[] {
  return Object.values(SUBSCRIPTION_PLANS).flatMap((plan) => [
    plan.prices.monthly,
    plan.prices.yearly,
  ]);
}

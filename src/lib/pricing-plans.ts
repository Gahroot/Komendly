// Client-safe pricing plans configuration
// Does NOT import from stripe.ts to avoid server-side dependencies

import { PLAN_CONFIG } from "./stripe-config";

// Plan display configuration for UI components
export const plans = [
  {
    ...PLAN_CONFIG.starter,
    key: "starter" as const,
    minutes: PLAN_CONFIG.starter.minutesPerMonth,
    popular: false,
  },
  {
    ...PLAN_CONFIG.pro,
    key: "pro" as const,
    minutes: PLAN_CONFIG.pro.minutesPerMonth,
    popular: true,
  },
  {
    ...PLAN_CONFIG.enterprise,
    key: "enterprise" as const,
    minutes: PLAN_CONFIG.enterprise.minutesPerMonth,
    popular: false,
  },
];

export type Plan = (typeof plans)[number];
export type BillingCycle = "monthly" | "yearly";

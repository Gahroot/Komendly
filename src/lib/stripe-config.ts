// Stripe configuration - safe to import in client components
// Price IDs and plan definitions (no Stripe client)

// Plan display configuration
export const PLAN_CONFIG = {
  starter: {
    name: "Starter",
    description: "Perfect for small businesses getting started",
    monthlyPrice: 49,
    yearlyPrice: 470,
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
    description: "For growing businesses with more video needs",
    monthlyPrice: 99,
    yearlyPrice: 950,
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
    description: "For large teams with high-volume needs",
    monthlyPrice: 199,
    yearlyPrice: 1900,
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

export type PlanKey = keyof typeof PLAN_CONFIG;

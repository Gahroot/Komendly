// Stripe configuration - safe to import in client components
// Price IDs and plan definitions (no Stripe client)

// Plan display configuration
export const PLAN_CONFIG = {
  starter: {
    name: "Starter",
    description: "Perfect for small businesses getting started",
    monthlyPrice: 60,
    yearlyPrice: 600,
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
    monthlyPrice: 300,
    yearlyPrice: 3000,
    minutesPerMonth: 20,
    features: [
      "20 minutes of video generation per month",
      "4K quality exports",
      "Premium AI avatars",
      "Priority support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    description: "For large teams with high-volume needs",
    monthlyPrice: 600,
    yearlyPrice: 6000,
    minutesPerMonth: 60,
    features: [
      "60 minutes of video generation per month",
      "4K quality exports",
      "All premium AI avatars",
      "Dedicated support",
      "Custom integrations",
    ],
  },
} as const;

export type PlanKey = keyof typeof PLAN_CONFIG;

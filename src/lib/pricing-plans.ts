export const plans = [
  {
    name: "Starter",
    key: "starter",
    description: "Perfect for small businesses getting started",
    monthlyPrice: 49,
    yearlyPrice: 470, // ~20% discount
    minutes: 3,
    features: [
      "3 minutes of video generation per month",
      "HD quality exports",
      "Basic AI avatars",
      "Email support",
    ],
    priceIds: {
      monthly: "price_1SjObSKjuiGf4unh0njyorCR",
      yearly: "price_1SjObUKjuiGf4unhZLUdFD0N",
    },
  },
  {
    name: "Pro",
    key: "pro",
    description: "For growing businesses with more video needs",
    monthlyPrice: 99,
    yearlyPrice: 950,
    minutes: 20,
    popular: true,
    features: [
      "20 minutes of video generation per month",
      "4K quality exports",
      "Premium AI avatars",
      "Priority support",
      "API access",
    ],
    priceIds: {
      monthly: "price_1SjObkKjuiGf4unhHjZzjjU0",
      yearly: "price_1SjObrKjuiGf4unhSFMHUvtf",
    },
  },
  {
    name: "Enterprise",
    key: "enterprise",
    description: "For large teams with high-volume needs",
    monthlyPrice: 199,
    yearlyPrice: 1900,
    minutes: 60,
    features: [
      "60 minutes (1 hour) of video per month",
      "4K quality exports",
      "All premium AI avatars",
      "Dedicated support",
      "Full API access",
      "Custom integrations",
    ],
    priceIds: {
      monthly: "price_1SjObuKjuiGf4unhvddauQaz",
      yearly: "price_1SjObwKjuiGf4unhDE4KZvXG",
    },
  },
];

export type Plan = typeof plans[number];
export type BillingCycle = "monthly" | "yearly";

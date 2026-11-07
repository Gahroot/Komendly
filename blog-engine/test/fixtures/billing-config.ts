export const ADS_PLANS: readonly AdsPlanTier[] = [
  {
    key: "starter",
    name: "Starter",
    priceCents: 3900,
    monthlyCredits: 15,
    priceEnv: "STRIPE_ADS_STARTER_PRICE_ID",
    highlights: ["15 credits / month", "All sizes: 4:5, 1:1, 9:16"],
  },
  {
    key: "growth",
    name: "Growth",
    priceCents: 9900,
    monthlyCredits: 45,
    priceEnv: "STRIPE_ADS_GROWTH_PRICE_ID",
    highlights: ["Everything in Starter"],
  },
];

export const ADS_TOPUPS: readonly AdsTopupPack[] = [
  { key: "topup_10", name: "10 credits", priceCents: 2500, credits: 10, priceEnv: "STRIPE_ADS_TOPUP_10_PRICE_ID" },
];

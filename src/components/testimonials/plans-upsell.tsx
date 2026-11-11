"use client";

import { useRouter } from "next/navigation";
import { PricingCards } from "@/components/pricing-cards";

/** Monthly plans on the landing page: sign up first, then straight to that plan's checkout. */
export function PlansUpsell() {
  const router = useRouter();
  return <PricingCards onSelectPlan={(plan, billing) => router.push(`/register?${new URLSearchParams({ plan: plan.key, billing }).toString()}`)} />;
}

"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { plans, type Plan, type BillingCycle } from "@/lib/pricing-plans";
import { cn } from "@/lib/utils";

interface PricingCardsProps {
  onSelectPlan: (plan: Plan, billingCycle: BillingCycle) => void | Promise<void>;
  loading?: string | null;
  showBillingToggle?: boolean;
}

/** Cost of one video (up to 60s) on a plan; 1 video = 1 minute. */
export function perVideoPrice(monthlyPrice: number, videos: number): string {
  return `$${Math.round(monthlyPrice / Math.max(1, videos))}`;
}

export function PricingCards({ onSelectPlan, loading = null, showBillingToggle = true }: PricingCardsProps) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  return (
    <>
      {showBillingToggle && (
        <div className="mb-10 flex justify-center">
          <div className="flex rounded-full border border-border bg-[oklch(1_0_0/4%)] p-1" role="radiogroup" aria-label="Billing cycle">
            {(["monthly", "yearly"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={billingCycle === c}
                onClick={() => setBillingCycle(c)}
                className="spell-chip min-h-10 rounded-full px-5 text-sm font-medium capitalize"
              >
                {c}
                {c === "yearly" ? <span className="ml-1.5 text-xs">(2 months free)</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const price = billingCycle === "monthly" ? plan.monthlyPrice : Math.round(plan.yearlyPrice / 12);
          return (
            <div
              key={plan.key}
              className={cn(
                "pixel-frame relative flex flex-col p-7",
                plan.popular ? "bg-[linear-gradient(180deg,#3a2266,#1c0f36)] shadow-[0_0_60px_-20px_#ffcf4a88]" : "bg-[oklch(0.2_0.07_295/0.62)]",
              )}
            >
              {plan.popular && (
                <p className="mb-3 w-max rounded-full bg-[var(--studio-gold)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#2a0f10]">Most popular</p>
              )}
              <h3 className="font-display text-2xl font-medium">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="font-display text-5xl font-medium tabular-nums">${price}</span>
                <span className="text-muted-foreground">/month</span>
              </p>
              {billingCycle === "yearly" && <p className="text-sm text-muted-foreground">${plan.yearlyPrice} billed yearly</p>}
              <p className="mt-2 text-sm text-foreground">
                {plan.minutes} videos/month · <span className="font-semibold text-[var(--studio-gold)]">{perVideoPrice(price, plan.minutes)} per video</span>
              </p>
              <ul className="mb-7 mt-6 flex-1 space-y-2.5 border-t border-border pt-5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground/90">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--studio-gold)]" />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onSelectPlan(plan, billingCycle)}
                disabled={loading !== null}
                className={cn(
                  "inline-flex h-12 w-full items-center justify-center rounded-2xl px-5 font-semibold disabled:opacity-60",
                  plan.popular ? "spellbar__cta" : "border border-border text-foreground transition-colors hover:bg-accent",
                )}
              >
                {loading === plan.key ? (
                  <>
                    <Loader2 aria-hidden className="mr-2 size-5 animate-spin" />
                    Opening checkout…
                  </>
                ) : (
                  `Get ${plan.name}`
                )}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

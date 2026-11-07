"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plans, type Plan, type BillingCycle } from "@/lib/pricing-plans";

const fadeInUp = {
  initial: { opacity: 1, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 },
};

const staggerContainer = {
  initial: {},
  whileInView: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

interface PricingCardsProps {
  onSelectPlan: (plan: Plan, billingCycle: BillingCycle) => void | Promise<void>;
  loading?: string | null;
  showBillingToggle?: boolean;
}

export function PricingCards({
  onSelectPlan,
  loading = null,
  showBillingToggle = true
}: PricingCardsProps) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");

  return (
    <>
      {/* Billing Toggle */}
      {showBillingToggle && (
        <div className="flex justify-center mb-12">
          <div className="glass-subtle flex rounded-full border border-border p-1" role="group" aria-label="Billing cycle">
            <button
              onClick={() => setBillingCycle("monthly")}
              type="button"
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                billingCycle === "monthly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              type="button"
              className={`px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                billingCycle === "yearly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Yearly
              <span className="ml-2 text-xs text-success">Save 20%</span>
            </button>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <motion.div
        className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto"
        variants={staggerContainer}
        initial="initial"
        whileInView="whileInView"
        viewport={{ once: true }}
      >
        {plans.map((plan) => (
          <motion.div
            key={plan.key}
            variants={fadeInUp}
            className={`relative flex flex-col rounded-3xl border p-8 ${
              plan.popular
                ? "glass glow-primary border-primary/50 bg-gradient-to-b from-primary/15 to-card"
                : "glass border-border"
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-brand rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider shadow-[var(--glass-rim)]">
                  Most Popular
                </span>
              </div>
            )}

            <div className="text-center mb-6">
              <h3 className="mb-2 text-xl font-semibold tracking-tight">{plan.name}</h3>
              <p className="text-muted-foreground text-sm">{plan.description}</p>
            </div>

            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center">
                <span className="text-5xl font-semibold tracking-tight tabular-nums">
                  ${billingCycle === "monthly" ? plan.monthlyPrice : Math.round(plan.yearlyPrice / 12)}
                </span>
                <span className="text-muted-foreground ml-2">/month</span>
              </div>
              {billingCycle === "yearly" && (
                <p className="text-sm text-muted-foreground mt-1">
                  ${plan.yearlyPrice} billed annually
                </p>
              )}
              <div className="mt-3 inline-block rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm text-primary">
                {plan.minutes} minutes/month
              </div>
            </div>

            <ul className="mb-8 flex-1 space-y-3 border-t border-border pt-6">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <span className="text-foreground/80 text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={() => onSelectPlan(plan, billingCycle)}
              disabled={loading !== null}
              variant={plan.popular ? "default" : "outline"}
              className="h-12 w-full text-base font-semibold"
            >
              {loading === plan.key ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                `Get ${plan.name}`
              )}
            </Button>
          </motion.div>
        ))}
      </motion.div>
    </>
  );
}

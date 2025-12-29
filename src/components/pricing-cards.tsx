"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plans, type Plan, type BillingCycle } from "@/lib/pricing-plans";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
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
          <div className="bg-zinc-800 rounded-full p-1 flex">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                billingCycle === "monthly"
                  ? "bg-purple-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                billingCycle === "yearly"
                  ? "bg-purple-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Yearly
              <span className="ml-2 text-xs text-green-400">Save 20%</span>
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
            className={`relative rounded-2xl p-8 ${
              plan.popular
                ? "bg-gradient-to-b from-purple-900/50 to-zinc-900 border-2 border-purple-500"
                : "bg-zinc-800/50 border border-zinc-700"
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-purple-600 text-white text-sm font-medium px-4 py-1 rounded-full">
                  Most Popular
                </span>
              </div>
            )}

            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <p className="text-zinc-400 text-sm">{plan.description}</p>
            </div>

            <div className="text-center mb-6">
              <div className="flex items-baseline justify-center">
                <span className="text-5xl font-bold">
                  ${billingCycle === "monthly" ? plan.monthlyPrice : Math.round(plan.yearlyPrice / 12)}
                </span>
                <span className="text-zinc-400 ml-2">/month</span>
              </div>
              {billingCycle === "yearly" && (
                <p className="text-sm text-zinc-400 mt-1">
                  ${plan.yearlyPrice} billed annually
                </p>
              )}
              <div className="mt-2 inline-block bg-purple-600/20 text-purple-400 text-sm px-3 py-1 rounded-full">
                {plan.minutes} minutes/month
              </div>
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-zinc-300 text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={() => onSelectPlan(plan, billingCycle)}
              disabled={loading !== null}
              className={`w-full py-6 text-lg font-semibold ${
                plan.popular
                  ? "bg-purple-600 hover:bg-purple-700"
                  : "bg-zinc-700 hover:bg-zinc-600"
              }`}
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

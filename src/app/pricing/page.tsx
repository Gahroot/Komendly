"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Shield } from "lucide-react";
import { PricingCards } from "@/components/pricing-cards";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { type Plan, type BillingCycle } from "@/lib/pricing-plans";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5 },
};

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get userId and email from URL params (from registration redirect)
  const userId = searchParams.get("userId");
  const email = searchParams.get("email");
  const canceled = searchParams.get("canceled");

  useEffect(() => {
    if (canceled === "true") {
      setError("Checkout was canceled. Please select a plan to continue.");
    }
  }, [canceled]);

  const handleSelectPlan = async (plan: Plan, billingCycle: BillingCycle) => {
    if (!userId || !email) {
      // Redirect to register if no user info
      router.push("/register");
      return;
    }

    setLoading(plan.key);
    setError(null);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: plan.key,
          userId,
          email,
          billingCycle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 via-black to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-transparent" />

        <div className="relative mx-auto max-w-6xl px-4 pt-32 pb-16 sm:px-6 sm:pt-40 sm:pb-24">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Choose Your{" "}
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                Plan
              </span>
            </h1>
            <p className="mt-6 text-lg text-zinc-400 sm:text-xl max-w-2xl mx-auto">
              Select a plan to start generating AI-powered video testimonials.
              No hidden fees. Cancel anytime.
            </p>

            {error && (
              <motion.div
                className="mt-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 max-w-md mx-auto"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {error}
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards Section */}
      <section className="relative py-8 sm:py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <PricingCards onSelectPlan={handleSelectPlan} loading={loading} />
        </div>
      </section>

      {/* Additional Credits Info */}
      <section className="relative py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            className="bg-zinc-900/50 rounded-2xl p-8 sm:p-12 max-w-2xl mx-auto border border-zinc-800 text-center"
            {...fadeInUp}
          >
            <h3 className="text-2xl font-bold mb-4">Need More Minutes?</h3>
            <p className="text-zinc-400 mb-4">
              Purchase additional video generation minutes anytime at{" "}
              <span className="text-white font-semibold">$20 per minute</span>.
              Minimum purchase of 1 minute.
            </p>
            <p className="text-sm text-zinc-500">
              Available to all subscribers from your dashboard billing settings.
            </p>
          </motion.div>

          {/* Security Badge */}
          <motion.div
            className="mt-12 flex items-center justify-center gap-2 text-zinc-500"
            {...fadeInUp}
          >
            <Shield className="h-4 w-4" />
            <p className="text-sm">
              Secure payment powered by Stripe. Your card details are never stored on our servers.
            </p>
          </motion.div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function PricingLoading() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<PricingLoading />}>
      <PricingContent />
    </Suspense>
  );
}

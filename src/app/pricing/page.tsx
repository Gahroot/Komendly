"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PricingCards } from "@/components/pricing-cards";
import { type Plan, type BillingCycle } from "@/lib/pricing-plans";
import { Loader2 } from "lucide-react";

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
      const priceId = billingCycle === "monthly"
        ? plan.priceIds.monthly
        : plan.priceIds.yearly;

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
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
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="max-w-7xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Select a plan to start generating AI-powered video testimonials.
            All plans include a credit card requirement for security.
          </p>

          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
              {error}
            </div>
          )}
        </div>

        <PricingCards
          onSelectPlan={handleSelectPlan}
          loading={loading}
        />

        {/* Additional Credits Info */}
        <div className="mt-16 text-center">
          <div className="bg-gray-800/50 rounded-xl p-8 max-w-2xl mx-auto border border-gray-700">
            <h3 className="text-xl font-semibold mb-3">Need More Minutes?</h3>
            <p className="text-gray-400 mb-4">
              Purchase additional video generation minutes anytime at{" "}
              <span className="text-white font-semibold">$20 per minute</span>.
              Minimum purchase of 1 minute.
            </p>
            <p className="text-sm text-gray-500">
              Available to all subscribers from your dashboard billing settings.
            </p>
          </div>
        </div>

        {/* Security Badge */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm">
            Secure payment powered by Stripe. Your card details are never stored on our servers.
          </p>
        </div>
      </div>
    </div>
  );
}

function PricingLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
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

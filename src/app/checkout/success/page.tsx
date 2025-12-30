"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2, AlertCircle } from "lucide-react";

function CheckoutSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [userData, setUserData] = useState<{
    email?: string;
    name?: string;
    plan?: string;
    minutesLimit?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setError("No session ID provided");
      return;
    }

    const verifySession = async () => {
      try {
        const response = await fetch(`/api/stripe/checkout?session_id=${sessionId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to verify payment");
        }

        if (data.success && data.user) {
          setUserData(data.user);
          setStatus("success");

          // Track purchase conversion in GA4
          if (typeof window !== "undefined" && typeof window.gtag === "function") {
            const planPrices: Record<string, number> = {
              pro: 29,
              business: 99,
            };
            const value = planPrices[data.user.plan?.toLowerCase()] || 29;
            window.gtag("event", "purchase", {
              value: value,
              currency: "USD",
              transaction_id: sessionId,
            });
          }

          // Track purchase conversion via Facebook Conversions API
          try {
            const planPrices: Record<string, number> = {
              pro: 29,
              business: 99,
            };
            const value = planPrices[data.user.plan?.toLowerCase()] || 29;

            // Get Facebook cookies for better attribution
            const getCookie = (name: string) => {
              const value = `; ${document.cookie}`;
              const parts = value.split(`; ${name}=`);
              if (parts.length === 2) return parts.pop()?.split(";").shift();
              return undefined;
            };

            await fetch("/api/facebook-capi", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                eventType: "Purchase",
                email: data.user.email,
                value: value,
                currency: "USD",
                transactionId: sessionId,
                contentName: `${data.user.plan} Plan`,
                sourceUrl: window.location.href,
                fbc: getCookie("_fbc"),
                fbp: getCookie("_fbp"),
              }),
            });
          } catch (fbError) {
            // Don't block on Facebook tracking errors
            console.error("Facebook CAPI error:", fbError);
          }

          // After successful payment verification, log the user in
          // Create a session for them
          const loginResponse = await fetch("/api/auth/login-after-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: data.user.id }),
          });

          if (loginResponse.ok) {
            // Redirect to dashboard after a short delay
            setTimeout(() => {
              router.push("/dashboard");
            }, 3000);
          }
        } else {
          throw new Error("Payment verification failed");
        }
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    };

    verifySession();
  }, [sessionId, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-16 w-16 animate-spin text-purple-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-white mb-2">
            Verifying your payment...
          </h2>
          <p className="text-gray-400">Please wait while we confirm your subscription.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">
            Payment Verification Failed
          </h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <div className="space-x-4">
            <Button
              onClick={() => router.push("/pricing")}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Try Again
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="border-gray-600 text-gray-300"
            >
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <Check className="h-10 w-10 text-green-500" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">
          Welcome to Komendly!
        </h1>

        <p className="text-gray-400 mb-6">
          Your subscription is now active. You&apos;re all set to start creating amazing video testimonials.
        </p>

        {userData && (
          <div className="bg-gray-800/50 rounded-xl p-6 mb-6 border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Your Plan Details</h3>
            <div className="space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-gray-400">Plan:</span>
                <span className="text-white font-medium capitalize">{userData.plan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Monthly Minutes:</span>
                <span className="text-white font-medium">{userData.minutesLimit} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Email:</span>
                <span className="text-white font-medium">{userData.email}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-2 text-gray-400 text-sm mb-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Redirecting to your dashboard...</span>
        </div>

        <Button
          onClick={() => router.push("/dashboard")}
          className="bg-purple-600 hover:bg-purple-700 px-8 py-6 text-lg"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

function CheckoutSuccessLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-16 w-16 animate-spin text-purple-500 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-white mb-2">Loading...</h2>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<CheckoutSuccessLoading />}>
      <CheckoutSuccessContent />
    </Suspense>
  );
}

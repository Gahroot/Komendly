"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CreditCard,
  Clock,
  Plus,
  ExternalLink,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";

interface UserSubscription {
  plan: string;
  subscriptionStatus: string;
  minutesUsed: number;
  minutesLimit: number;
  bonusMinutes: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export default function BillingPage() {
  const [user, setUser] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [minutesToBuy, setMinutesToBuy] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (err) {
      console.error("Failed to fetch user data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyCredits = async () => {
    if (minutesToBuy < 1) {
      setError("Minimum purchase is 1 minute");
      return;
    }

    setPurchasing(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: minutesToBuy }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start purchase");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPurchasing(false);
    }
  };

  const handleOpenPortal = async () => {
    setOpeningPortal(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to open billing portal");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setOpeningPortal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const remainingMinutes = user
    ? Math.max(0, user.minutesLimit - user.minutesUsed)
    : 0;

  const periodEndDate = user?.currentPeriodEnd
    ? new Date(user.currentPeriodEnd).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing & Usage</h1>
        <p className="text-zinc-400 mt-1">
          Manage your subscription and purchase additional video minutes
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Plan */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-purple-500" />
              Current Plan
            </CardTitle>
            <CardDescription>Your active subscription</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Plan</span>
              <span className="text-white font-semibold capitalize">
                {user?.plan || "None"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Status</span>
              <span
                className={`font-semibold flex items-center gap-1 ${
                  user?.subscriptionStatus === "active"
                    ? "text-green-500"
                    : "text-yellow-500"
                }`}
              >
                {user?.subscriptionStatus === "active" && (
                  <Check className="h-4 w-4" />
                )}
                {user?.subscriptionStatus || "Inactive"}
              </span>
            </div>
            {periodEndDate && (
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">
                  {user?.cancelAtPeriodEnd ? "Ends on" : "Renews on"}
                </span>
                <span className="text-white">{periodEndDate}</span>
              </div>
            )}
            {user?.cancelAtPeriodEnd && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/50 rounded-lg text-yellow-400 text-sm">
                Your subscription will end on {periodEndDate}. You can resubscribe
                anytime.
              </div>
            )}

            <Button
              onClick={handleOpenPortal}
              disabled={openingPortal}
              className="w-full mt-4 bg-zinc-800 hover:bg-zinc-700"
            >
              {openingPortal ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening...
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Subscription
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Usage */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-purple-500" />
              Usage This Period
            </CardTitle>
            <CardDescription>Video generation minutes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Minutes used</span>
                <span className="text-white">
                  {user?.minutesUsed || 0} / {user?.minutesLimit || 0}
                </span>
              </div>
              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all"
                  style={{
                    width: `${
                      user?.minutesLimit
                        ? Math.min(
                            100,
                            (user.minutesUsed / user.minutesLimit) * 100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                <div className="text-2xl font-bold text-white">
                  {remainingMinutes}
                </div>
                <div className="text-xs text-zinc-400">Minutes remaining</div>
              </div>
              <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                <div className="text-2xl font-bold text-purple-400">
                  {user?.bonusMinutes || 0}
                </div>
                <div className="text-xs text-zinc-400">Bonus minutes</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Buy More Minutes */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Plus className="h-5 w-5 text-purple-500" />
            Buy Additional Minutes
          </CardTitle>
          <CardDescription>
            Purchase extra video generation minutes at $20 per minute
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="space-y-2 flex-1">
              <label className="text-sm text-zinc-400">Number of minutes</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={minutesToBuy}
                  onChange={(e) =>
                    setMinutesToBuy(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="bg-zinc-800 border-zinc-700 w-24"
                />
                <span className="text-zinc-400">
                  = ${(minutesToBuy * 20).toFixed(2)}
                </span>
              </div>
            </div>
            <Button
              onClick={handleBuyCredits}
              disabled={purchasing}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {purchasing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Purchase Minutes
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-zinc-500 mt-3">
            Purchased minutes never expire and carry over between billing periods.
            Minimum purchase: 1 minute.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

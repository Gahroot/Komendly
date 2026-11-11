"use client";

import { useEffect } from "react";
import type { CheckoutPixel } from "@/lib/ads/checkout-pixel";
import { track } from "@/lib/analytics/track";

/** Billing page return from Stripe: record the outcome once, then strip the query so a refresh doesn't double count. */
export function CheckoutReturnTracker({ outcome, pixel }: { outcome: "success" | "canceled"; pixel?: CheckoutPixel | null }) {
  const sessionId = pixel?.sessionId;
  const subscription = pixel?.subscription;
  const value = pixel?.value;
  const currency = pixel?.currency;
  useEffect(() => {
    if (outcome === "success") {
      // Same event_id as the webhook's CAPI Purchase/Subscribe (Purchase:<checkoutSessionId>) so Meta dedupes.
      track("purchase", {
        source: "ads_billing",
        value,
        currency,
        meta_event_id_Purchase: sessionId && `Purchase:${sessionId}`,
        meta_event_id_Subscribe: sessionId && `Subscribe:${sessionId}`,
        meta_subscription: subscription,
      });
    } else track("begin_checkout", { canceled: true });
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    url.searchParams.delete("session_id");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [outcome, sessionId, subscription, value, currency]);
  return null;
}

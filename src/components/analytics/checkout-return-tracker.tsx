"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/track";

/** Billing page return from Stripe: record the outcome once, then strip the query so a refresh doesn't double count. */
export function CheckoutReturnTracker({ outcome }: { outcome: "success" | "canceled" }) {
  useEffect(() => {
    track(outcome === "success" ? "purchase" : "begin_checkout", outcome === "success" ? { source: "ads_billing" } : { canceled: true });
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [outcome]);
  return null;
}

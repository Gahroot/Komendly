"use client";

import { track } from "@/lib/analytics/track";
import { FIRST_VIDEO_OFFER } from "@/lib/first-video-offer";

export type CheckoutStart = { ok: true } | { ok: false; error: string; reason?: string };

/** Start the $19 first-video checkout for a registered (not yet signed-in) user and redirect to Stripe. */
export async function startFirstVideoCheckout(userId: string, email: string): Promise<CheckoutStart> {
  try {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offer: FIRST_VIDEO_OFFER.key, userId, email }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; reason?: string };
    if (!res.ok || !data.url) return { ok: false, error: data.error || "Couldn't open checkout. Please try again.", reason: data.reason };
    track("begin_checkout", { product: "testimonials", offer: FIRST_VIDEO_OFFER.key, value: FIRST_VIDEO_OFFER.priceCents / 100, currency: "USD" });
    window.location.href = data.url;
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach checkout. Check your connection and try again." };
  }
}

"use client";

/** Fire-and-forget server funnel event for the offer sequence. Never throws. */
export type OfferEventName =
  | "upsell_shown"
  | "upsell_declined"
  | "downsell_shown"
  | "offer_nudge_shown"
  | "offer_modal_shown"
  | "offer_dismissed"
  | "offer_clicked"
  | "locked_bonus_shown";

export type OfferPlacement = "early_offer" | "early_ready" | "trial_done" | "post_download" | "locked_bonus" | "unlock_pack" | "unlock_pack_next";

export function postOfferEvent(name: OfferEventName, props: Record<string, string | number | boolean> = {}): void {
  void fetch("/api/ads-billing/offer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, props }), keepalive: true }).catch(() => undefined);
}

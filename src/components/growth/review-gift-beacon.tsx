"use client";

import { useEffect } from "react";

/** Counts a review-gift view once per tab session (JS only, so mail link scanners don't count). */
export function ReviewGiftBeacon({ token }: { token: string }) {
  useEffect(() => {
    const key = `review_gift_viewed:${token}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void fetch(`/api/ads/gift-public/review/${token}`, { method: "POST", keepalive: true }).catch(() => undefined);
  }, [token]);
  return null;
}

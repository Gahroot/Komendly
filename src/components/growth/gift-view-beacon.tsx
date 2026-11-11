"use client";

import { useEffect } from "react";

/** Counts a gift view (server skips bots, Meta IPs and the sender). Once per tab session. */
export function GiftViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    const key = `gift_viewed:${token}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void fetch(`/api/ads/gift-public/${token}/view`, { method: "POST", keepalive: true }).catch(() => undefined);
  }, [token]);
  return null;
}

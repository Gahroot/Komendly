"use client";

import { useEffect } from "react";
import { TRADE_COOKIE, TRADE_COOKIE_MAX_AGE } from "@/lib/ads/trade";

/** Trade landing pages (/free-ads/roofers): remember the trade so sign-up / run start can tag the workspace. */
export function TradeCookie({ trade }: { trade: string }) {
  useEffect(() => {
    document.cookie = `${TRADE_COOKIE}=${encodeURIComponent(trade)}; path=/; max-age=${TRADE_COOKIE_MAX_AGE}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [trade]);
  return null;
}

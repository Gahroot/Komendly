"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { adsFetcher } from "@/lib/ads/run-client";
import type { BfcmState } from "@/lib/ads/bfcm";

/** trade + autopilot: trade workspaces (roofers) lead with Growth Autopilot (src/lib/ads/roofer-offer.ts). */
interface OfferState { open: boolean; expiresAt: string | null; serverNow?: string; unlockPack?: boolean; trade?: string | null; autopilot?: boolean; spotsLeft?: number | null; autopilotLaunch?: boolean; autopilotLaunchSpotsLeft?: number | null; bfcm?: BfcmState | null }
interface OfferFetch extends OfferState { offsetMs: number }

async function offerFetcher(url: string): Promise<OfferFetch> {
  const data = await adsFetcher<OfferState>(url);
  return { ...data, offsetMs: data.serverNow ? new Date(data.serverNow).getTime() - Date.now() : 0 };
}

/** Launch Quarter eligibility + a live countdown on server time (expiresAt = trial finish + 72h, from the server). */
export function useLaunchOffer(enabled = true) {
  const { data, error, mutate } = useSWR<OfferFetch>(enabled ? "/api/ads-billing/offer#countdown" : null, (key: string) => offerFetcher(key.split("#")[0] ?? key), { revalidateOnFocus: true });
  const offsetMs = data?.offsetMs ?? 0;
  const [now, setNow] = useState(() => Date.now());
  const expiresMs = data?.expiresAt ? new Date(data.expiresAt).getTime() : null;
  useEffect(() => {
    if (!data?.open || expiresMs === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [data?.open, expiresMs]);
  const remainingMs = expiresMs === null ? null : Math.max(0, expiresMs - (now + offsetMs));
  const open = Boolean(data?.open) && (remainingMs === null || remainingMs > 0);
  return { loaded: Boolean(data), settled: Boolean(data) || Boolean(error), open, unlockPack: Boolean(data?.unlockPack), trade: data?.trade ?? null, autopilot: Boolean(data?.autopilot), spotsLeft: data?.spotsLeft ?? null, autopilotLaunch: Boolean(data?.autopilotLaunch), autopilotLaunchSpotsLeft: data?.autopilotLaunchSpotsLeft ?? null, expiresAt: data?.expiresAt ?? null, remainingMs, bfcm: data?.bfcm ?? null, offsetMs, refresh: mutate };
}

"use client";

import { EXP_COOKIE, experimentParams, parseAssignments, type Assignments } from "./experiments";
import type { FunnelEvent } from "./funnel-events";

type Params = Record<string, string | number | boolean | undefined>;
type Gtag = (...args: unknown[]) => void;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

export function currentAssignments(): Assignments {
  return parseAssignments(readCookie(EXP_COOKIE));
}

/** Send a funnel event to GA4 with every experiment variant attached. Never throws. */
export function track(event: FunnelEvent, params: Params = {}): void {
  try {
    if (typeof window === "undefined") return;
    const payload = { ...experimentParams(currentAssignments()), ...params };
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;
    if (typeof gtag === "function") gtag("event", event, payload);
    else {
      const w = window as unknown as { dataLayer?: unknown[] };
      (w.dataLayer ??= []).push({ event, ...payload });
    }
    if (process.env.NODE_ENV !== "production") console.debug("[track]", event, payload);
  } catch {
    // analytics must never break the product
  }
}

/** Fire once per key per browser (localStorage), e.g. first_ad_ready per run. */
export function trackOnce(key: string, event: FunnelEvent, params: Params = {}): void {
  try {
    const k = `kmd_tracked:${key}`;
    if (window.localStorage.getItem(k)) return;
    window.localStorage.setItem(k, "1");
  } catch {
    // storage blocked: still track (may duplicate)
  }
  track(event, params);
}

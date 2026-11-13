"use client";

import { useEffect } from "react";

function send(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon("/api/ads/pricing-event", new Blob([body], { type: "application/json" }));
    else void fetch("/api/ads/pricing-event", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // analytics must never break the page
  }
}

/**
 * Records one `pricing_viewed` per page view (server-side, fire-and-forget) and a `pricing_plan_clicked` for every
 * click on an element with `data-pricing-plan` (optional `data-pricing-interval`). Renders nothing.
 */
export function PricingBeacon({ page }: { page: string }) {
  useEffect(() => {
    send({ kind: "view", path: page });
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-pricing-plan]") : null;
      if (el) send({ kind: "click", path: page, plan: el.dataset.pricingPlan, interval: el.dataset.pricingInterval });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [page]);
  return null;
}

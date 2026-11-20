"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/track";

interface Props {
  endpoint: "/api/ads-billing/checkout" | "/api/ads-billing/portal";
  body?: { kind: "plan" | "topup" | "offer"; key: string; interval?: "month" | "year"; offer?: "studio_launch"; placement?: "trial_upsell" | "downsell" | "early_ready" | "early_offer" | "unlock_pack" | "unlock_pack_next" | "trial_done" | "post_download" | "locked_bonus" | "studio_launch" };
  label: string;
  disabled?: boolean;
  variant?: "default" | "outline";
}

async function startBilling(endpoint: Props["endpoint"], body: Props["body"]): Promise<void> {
  if (endpoint === "/api/ads-billing/checkout" && body) {
    track("begin_checkout", { kind: body.kind, plan: body.key, ...(body.interval ? { interval: body.interval } : {}), ...(body.placement ? { placement: body.placement } : {}) });
    if (body.placement === "trial_upsell") track("upsell_accepted", { kind: body.kind, plan: body.key });
    if (body.placement === "downsell") track("downsell_accepted", { kind: body.kind, plan: body.key });
  }
  const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data: { url?: string | null; error?: string } = await res.json().catch(() => ({}));
  if (res.ok && data.url) window.location.assign(data.url);
  else toast.error(data.error ?? "Couldn't open billing. Try again.");
}

/** Opens Stripe Checkout once for the plan picked on the pricing page (?plan=), then drops ?plan so Back doesn't reopen it. */
export function AutoCheckout({ planKey, planName, interval }: { planKey: string; planName: string; interval: "month" | "year" }) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("plan");
    window.history.replaceState(null, "", url.pathname + url.search);
    void startBilling("/api/ads-billing/checkout", { kind: "plan", key: planKey, interval }).catch(() => toast.error("Couldn't open billing. Try again."));
  }, [planKey, interval]);
  return <p role="status" className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">Opening secure checkout for {planName}… If nothing happens, choose it below.</p>;
}

/** Starts Stripe Checkout / Customer Portal and redirects. */
export function BillingActionButton({ endpoint, body, label, disabled, variant = "default" }: Props) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await startBilling(endpoint, body);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button className="w-full" variant={variant} data-pricing-plan={body ? `${body.kind === "plan" ? "" : `${body.kind}:`}${body.key}` : undefined} data-pricing-interval={body?.interval} disabled={disabled || busy} onClick={() => void go()}>
      {busy ? "Opening…" : label}
    </Button>
  );
}

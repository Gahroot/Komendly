"use client";

import { useState } from "react";
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

/** Starts Stripe Checkout / Customer Portal and redirects. */
export function BillingActionButton({ endpoint, body, label, disabled, variant = "default" }: Props) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    if (endpoint === "/api/ads-billing/checkout" && body) {
      track("begin_checkout", { kind: body.kind, plan: body.key, ...(body.interval ? { interval: body.interval } : {}), ...(body.placement ? { placement: body.placement } : {}) });
      if (body.placement === "trial_upsell") track("upsell_accepted", { kind: body.kind, plan: body.key });
      if (body.placement === "downsell") track("downsell_accepted", { kind: body.kind, plan: body.key });
    }
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const data: { url?: string | null; error?: string } = await res.json().catch(() => ({}));
      if (res.ok && data.url) window.location.assign(data.url);
      else toast.error(data.error ?? "Couldn't open billing. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button className="w-full" variant={variant} disabled={disabled || busy} onClick={() => void go()}>
      {busy ? "Opening…" : label}
    </Button>
  );
}

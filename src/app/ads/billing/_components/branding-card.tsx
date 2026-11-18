"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** "Remove Komendly branding" (paid-only). Free workspaces see it as an upsell. */
export function BrandingCard({ paid, removeBranding }: { paid: boolean; removeBranding: boolean }) {
  const [on, setOn] = useState(removeBranding);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const res = await fetch("/api/ads/branding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ removeBranding: !on }) });
    const data: { removeBranding?: boolean; error?: string } = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && typeof data.removeBranding === "boolean") setOn(data.removeBranding);
    else toast.error(data.error ?? "Couldn't save. Try again.");
  }
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="font-semibold">Remove Komendly branding</h2>
        <p className="text-sm text-muted-foreground">
          {paid
            ? on ? "Your new ads have no \"Made with Komendly\" mark." : "Your new ads carry a small \"Made with Komendly\" mark."
            : "Free ads carry a small \"Made with Komendly\" corner mark. Any paid plan removes it from new ads."}
        </p>
      </div>
      {paid
        ? <Button variant="outline" disabled={busy} onClick={toggle}>{on ? "Show the mark" : "Remove the mark"}</Button>
        : <Button asChild><a href="/ads/pricing">Upgrade to remove</a></Button>}
    </section>
  );
}

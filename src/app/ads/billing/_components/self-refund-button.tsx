"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SELF_REFUND_REASONS, type SelfRefundReason } from "@/lib/ads/self-refund-rules";

/** 30-day guarantee: one click, a confirm in Ozzy's voice, an optional one-line reason, then a full refund. */
export function SelfRefundButton({ amountLabel, endsLabel }: { amountLabel: string; endsLabel: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<SelfRefundReason | null>(null);
  const [busy, setBusy] = useState(false);
  async function refund() {
    setBusy(true);
    try {
      const res = await fetch("/api/ads-billing/self-refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }) });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success("Done. Your money is on its way back (banks take 5 to 10 days).");
        setOpen(false);
        window.location.reload();
      } else toast.error(data.error ?? "That didn't work. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>Refund my first payment</Button>
      <p className="mt-2 text-xs text-muted-foreground">30-day guarantee · available until {endsLabel}</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund {amountLabel}?</DialogTitle>
            <DialogDescription>
              No hard feelings, I promise. I&apos;ll send back your first payment in full and stop your plan right away. Credits from that payment go away too. This works once per customer.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">What didn&apos;t work? (optional)</legend>
            {SELF_REFUND_REASONS.map((r) => (
              <label key={r.key} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="self-refund-reason" checked={reason === r.key} onChange={() => setReason(r.key)} />
                {r.label}
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Keep my plan</Button>
            <Button variant="destructive" onClick={() => void refund()} disabled={busy}>{busy ? "Refunding…" : "Yes, refund me"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

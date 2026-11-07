"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RefundDialog({ workspaceId, workspaceName, stripeEnabled }: { workspaceId: string; workspaceName: string; stripeEnabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [amount, setAmount] = useState("0");
  const [credits, setCredits] = useState("0");
  const [reason, setReason] = useState("");
  const [viaStripe, setViaStripe] = useState(stripeEnabled);
  const [busy, setBusy] = useState(false);
  const amountCents = Math.round(Number(amount || 0) * 100);
  const creditCount = Math.round(Number(credits || 0));

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ads/refunds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, amountCents: viaStripe ? amountCents : 0, credits: creditCount, reason: reason || undefined, viaStripe }),
      });
      const data: { error?: string; creditsClawedBack?: number } = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Refund failed");
      else {
        toast.success(`Refund recorded · ${data.creditsClawedBack ?? 0} credits clawed back`);
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setConfirming(false); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Refund</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {workspaceName}</DialogTitle>
          <DialogDescription>
            {stripeEnabled ? "Refund money through Stripe and/or claw back credits." : "Stripe isn't configured: only credit claw-backs are possible."}
          </DialogDescription>
        </DialogHeader>
        {confirming ? (
          <p className="text-sm text-foreground">
            Refund <strong>{viaStripe ? `$${(amountCents / 100).toFixed(2)}` : "$0 (credit-only)"}</strong> and remove <strong>{creditCount}</strong> credits? This can&apos;t be undone.
          </p>
        ) : (
          <div className="grid gap-3">
            {stripeEnabled && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={viaStripe} onChange={(e) => setViaStripe(e.target.checked)} /> Refund money via Stripe (latest refundable charge)
              </label>
            )}
            {viaStripe && (
              <div className="grid gap-1.5">
                <Label htmlFor="refund-amount">Amount (USD)</Label>
                <Input id="refund-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="refund-credits">Credits to claw back</Label>
              <Input id="refund-credits" type="number" min="0" value={credits} onChange={(e) => setCredits(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="refund-reason">Reason</Label>
              <Input id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. duplicate charge" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => (confirming ? setConfirming(false) : setOpen(false))}>{confirming ? "Back" : "Cancel"}</Button>
          {confirming ? (
            <Button variant="destructive" disabled={busy} onClick={() => void submit()}>Confirm refund</Button>
          ) : (
            <Button disabled={(viaStripe ? amountCents : 0) <= 0 && creditCount <= 0} onClick={() => setConfirming(true)}>Review</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

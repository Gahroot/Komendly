"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdjustCreditsForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/ads/workspaces/${workspaceId}/credits`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ delta: Math.round(Number(delta)), note }),
      });
      const data: { error?: string; balance?: number } = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Adjustment failed");
      else {
        toast.success(`New balance: ${data.balance ?? "?"}`);
        setDelta("");
        setNote("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="adj-delta">Credits (+ grant / − remove)</Label>
        <Input id="adj-delta" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 20 or -5" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="adj-note">Note (required)</Label>
        <Input id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why?" />
      </div>
      <Button type="submit" disabled={busy || !delta || Number(delta) === 0 || note.trim().length < 3}>Apply adjustment</Button>
    </form>
  );
}

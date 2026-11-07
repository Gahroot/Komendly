"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/ads/run-client";
import { ozzy } from "@/components/ozzy/store";

export function RetryExtractionDialog({ runId, retriesLeft, onDone, onOpenChange }: { runId: string; retriesLeft: number; onDone: () => void; onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function change(next: boolean) {
    setOpen(next);
    onOpenChange(next);
  }

  async function submit() {
    setBusy(true);
    try {
      await postJson(`/api/ads/runs/${runId}/retry`, { note: note.trim() || undefined });
      ozzy.emit({ type: "recovery:retry" });
      change(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={retriesLeft <= 0}>
          <RotateCcw /> Retry extraction
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Have the agent look again</DialogTitle>
          <DialogDescription>Optional: tell it what it got wrong. {retriesLeft} {retriesLeft === 1 ? "retry" : "retries"} left.</DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={4} placeholder="e.g. We sell to clinic owners, not patients. Focus on the booking product." />
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>Retry extraction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

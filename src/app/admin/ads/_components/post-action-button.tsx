"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  url: string;
  body: Record<string, unknown>;
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  confirm?: { title: string; description: string };
}

/** POSTs JSON to an admin endpoint, then refreshes the server-rendered page. */
export function PostActionButton({ url, body, label, variant = "outline", confirm }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Action failed");
      else {
        toast.success(`${label}: done`);
        router.refresh();
      }
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button size="sm" variant={variant} disabled={busy} onClick={() => (confirm ? setOpen(true) : void run())}>
        {label}
      </Button>
      {confirm && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirm.title}</DialogTitle>
              <DialogDescription>{confirm.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant={variant === "destructive" ? "destructive" : "default"} disabled={busy} onClick={() => void run()}>
                {label}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

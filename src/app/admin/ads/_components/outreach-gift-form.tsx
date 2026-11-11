"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Admin outreach gift pack: same createGift() path as users (source admin_outreach). */
export function OutreachGiftForm() {
  const router = useRouter();
  const [f, setF] = useState({ url: "", recipientName: "", senderName: "Nolan from Komendly", note: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ads/gifts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, recipientName: f.recipientName || undefined, note: f.note || undefined }) });
      const data: { error?: string; token?: string } = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Couldn't create the gift");
      else {
        toast.success(`Gift started: /gift/${data.token ?? ""}`);
        setF({ ...f, url: "", recipientName: "", note: "" });
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="og-url">Recipient website</Label><Input id="og-url" required value={f.url} onChange={set("url")} placeholder="bakery.com" /></div>
      <div className="grid gap-1.5"><Label htmlFor="og-rn">Recipient name</Label><Input id="og-rn" value={f.recipientName} onChange={set("recipientName")} placeholder="Optional" /></div>
      <div className="grid gap-1.5"><Label htmlFor="og-sn">Sender name</Label><Input id="og-sn" required maxLength={40} value={f.senderName} onChange={set("senderName")} /></div>
      <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="og-note">Note</Label><Input id="og-note" maxLength={280} value={f.note} onChange={set("note")} placeholder="Optional" /></div>
      <Button type="submit" disabled={busy} className="sm:col-span-2">Make outreach gift</Button>
    </form>
  );
}

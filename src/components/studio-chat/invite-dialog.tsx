"use client";
import { Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "./api";

export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async (withEmail: boolean) => {
    setBusy(true);
    const r = await api<{ link: string; emailed: boolean }>("/api/studio/invites", { body: { email: withEmail ? email : "" } });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setLink(r.data.link);
    if (withEmail) toast.success(r.data.emailed ? "Ozzy sent your invite" : "Invite created");
    else {
      await navigator.clipboard.writeText(r.data.link).catch(() => undefined);
      toast.success("Invite link copied");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Give a friend 2 free videos</DialogTitle>
          <DialogDescription>They chat with Ozzy, no card needed. You get 1 more free video when they confirm their email.</DialogDescription>
        </DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void create(true); }}>
          <label htmlFor="invite-email" className="sr-only">Friend&apos;s email</label>
          <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" className="field h-10 min-w-0 flex-1 rounded-lg border border-white/12 bg-black/20 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-gold)]" />
          <button type="submit" disabled={busy} className="spellbar__cta inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold">{busy && <Loader2 className="size-4 animate-spin" />}Send</button>
        </form>
        <button type="button" disabled={busy} onClick={() => void create(false)} className="studio-chip w-fit"><Copy className="size-4" />Copy an invite link instead</button>
        {link && <p className="break-all rounded-lg bg-black/25 p-2 font-mono text-xs">{link}</p>}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postJson } from "@/lib/ads/run-client";
import { isValidSiteUrl } from "@/lib/ads/url-submit";

/** Website + your first name (+ their name, note) -> POST /api/ads/gifts -> progress screen. */
export function GiftForm({ defaultSender, cta = "Make their 3 ads" }: { defaultSender: string; cta?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ url: "", senderName: defaultSender, recipientName: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidSiteUrl(form.url)) return setError("Paste their website, e.g. joesbakery.com");
    if (!form.senderName.trim()) return setError("Add your first name so they know who it's from.");
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ id: string }>("/api/ads/gifts", {
        url: form.url.trim(),
        senderName: form.senderName.trim(),
        ...(form.recipientName.trim() ? { recipientName: form.recipientName.trim() } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      });
      router.push(`/ads/gifts/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const field = "h-12 rounded-xl bg-black/25 text-base sm:text-sm";
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="gift-url">Their website</Label>
        <Input id="gift-url" inputMode="url" autoComplete="off" placeholder="joesbakery.com" value={form.url} onChange={set("url")} className={field} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gift-from">Your first name</Label>
          <Input id="gift-from" autoComplete="given-name" maxLength={40} value={form.senderName} onChange={set("senderName")} className={field} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gift-to">Their name <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="gift-to" maxLength={60} placeholder="Joe" value={form.recipientName} onChange={set("recipientName")} className={field} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gift-note">A short note <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea id="gift-note" maxLength={280} rows={2} placeholder="Saw your new menu, thought these might help!" value={form.note} onChange={set("note")} className="rounded-xl bg-black/25 text-base sm:text-sm" />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <button type="submit" disabled={busy} className="spellbar__cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 font-semibold disabled:opacity-70">
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Gift className="size-4" aria-hidden />}
        {cta}
      </button>
    </form>
  );
}

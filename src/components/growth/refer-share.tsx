"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { ShareButtons } from "./share-buttons";

export function ReferShare({ link }: { link: string }) {
  const text = `I make my Facebook & Instagram ads with Komendly: paste your website and it designs them for you. This link gets you 20 free ads (double the normal free pack): ${link}`;
  return <ShareButtons link={link} text={text} subject="20 free ads for your business" />;
}

/** Free month of Starter: Stripe Checkout with a 30-day trial (card required). */
export function ClaimFreeMonthButton() {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const res = await fetch("/api/ads-billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "referral_free_month", key: "starter" }) });
      const data: { url?: string | null; error?: string } = await res.json().catch(() => ({}));
      if (res.ok && data.url) window.location.assign(data.url);
      else toast.error(data.error ?? "Couldn't open checkout. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" disabled={busy} onClick={() => void go()} className="spellbar__cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 font-semibold disabled:opacity-70 sm:w-auto">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
      Claim your free month
    </button>
  );
}

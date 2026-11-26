"use client";
// Under a finished ad pack: (83) no-login approve link for a client/teammate, (82) share-to-a-friend prompt (referral), (84) showcase opt-in link.
import { useState } from "react";
import Link from "next/link";
import { CopyTextButton } from "@/components/growth/copy-text-button";

export function RunShareCard({ runId }: { runId: string }) {
  const [url, setUrl] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  async function make() {
    setErr(null);
    const r = await fetch("/api/ads/approve-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (j?.url) setUrl(j.url); else setErr(j?.error ?? "Couldn't make a link.");
  }
  return (
    <section className="mt-8 grid gap-4 rounded-2xl border border-border p-5 sm:grid-cols-2" aria-label="Share these ads">
      <div>
        <h2 className="font-medium">Get a client or teammate to approve</h2>
        <p className="mt-1 text-sm text-muted-foreground">A private link, no login. They approve or ask for changes and you get an email. Works for 60 days.</p>
        {url ? <div className="mt-3 flex items-center gap-2"><input readOnly value={url} className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-xs" /><CopyTextButton text={url} /></div> : <button onClick={() => void make()} className="mt-3 h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-white/[0.08]">Create approve link</button>}
        {err && <p role="alert" className="mt-2 text-sm text-red-400">{err}</p>}
      </div>
      <div>
        <h2 className="font-medium">Know someone who needs ads too?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Send a friend your link: they get extra free ads and you earn credits when they finish theirs. <Link className="underline" href="/ads/refer">Get my link</Link></p>
        <p className="mt-3 text-sm text-muted-foreground">Proud of these? <Link className="underline" href="/ads/showcase">Opt in to a public showcase</Link> (off unless you turn it on).</p>
      </div>
    </section>
  );
}

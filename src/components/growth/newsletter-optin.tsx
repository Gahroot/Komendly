"use client";
// Ozzy's Ad Report opt-in (growth system newsletter). Posts to /api/newsletter/subscribe -> double opt-in email.
import { useState } from "react";

export function NewsletterOptin({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ phase: "idle" | "working" | "done" | "error"; error?: string }>({ phase: "idle" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ phase: "working" });
    const r = await fetch("/api/newsletter/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, source }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string } | null;
    setState(r?.ok ? { phase: "done" } : { phase: "error", error: j?.error ?? "Something went wrong. Please try again." });
  }
  if (state.phase === "done") return <p role="status" className="rounded-2xl border border-border p-6">Check your inbox: we sent a confirmation link to {email}.</p>;
  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-border p-6 text-left">
      <label className="block text-sm"><span className="mb-1 block font-medium">Your email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-border bg-white/5 px-4 py-3 text-base outline-none focus:border-[var(--studio-gold)]" placeholder="you@yourbusiness.com" />
      </label>
      <button type="submit" disabled={state.phase === "working"} className="mt-4 inline-flex h-12 items-center justify-center rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] disabled:opacity-60">Send me the Ad Report</button>
      <p className="mt-3 text-xs text-muted-foreground">From Komendly. We email a confirmation link first. Unsubscribe in one click anytime.</p>
      {state.phase === "error" && <p role="alert" className="mt-3 text-sm text-[oklch(0.7_0.17_30)]">{state.error}</p>}
    </form>
  );
}

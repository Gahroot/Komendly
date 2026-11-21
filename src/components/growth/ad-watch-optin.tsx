"use client";
// Competitor ad watch opt-in (growth system ad_watch). Mounted on /tools/competitor-ad-watch, the /tools/meta-ad-check
// results and the ads dashboard. Posts to /api/ad-watch/subscribe -> double opt-in email; nothing weekly until confirmed.
import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

const MAX_PAGES = 5;

export interface AdWatchOptinProps {
  /** Where it was mounted (stored on the subscription), e.g. "meta_ad_check", "standalone", "dashboard". */
  source: string;
  defaultEmail?: string;
  defaultTrade?: string;
  defaultCity?: string;
  /** Prefilled rival Facebook Pages (e.g. the Page just checked). */
  defaultPages?: string[];
  /** "studio" = dark public pages (gold accent); "app" = dashboard theme. */
  tone?: "studio" | "app";
  title?: string;
  description?: string;
  className?: string;
}

export function AdWatchOptin({ source, defaultEmail = "", defaultTrade = "", defaultCity = "", defaultPages = [], tone = "studio", title = "Watch your competitors' new ads, free", description, className = "" }: AdWatchOptinProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [trade, setTrade] = useState(defaultTrade);
  const [city, setCity] = useState(defaultCity);
  const [pages, setPages] = useState<string[]>(defaultPages.length ? defaultPages.slice(0, MAX_PAGES) : [""]);
  const [state, setState] = useState<{ phase: "idle" | "working" | "done" | "error"; error?: string }>({ phase: "idle" });

  const field = tone === "studio"
    ? "w-full rounded-xl border border-border bg-white/5 px-4 py-3 text-base outline-none focus:border-[var(--studio-gold)]"
    : "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const btn = tone === "studio"
    ? "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] transition hover:brightness-105 disabled:opacity-60"
    : "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ phase: "working" });
    const body = { email, trade, city, pages: pages.map((p) => p.trim()).filter(Boolean), source };
    const r = await fetch("/api/ad-watch/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { error?: string } | null;
    setState(r?.ok ? { phase: "done" } : { phase: "error", error: j?.error ?? "Something went wrong. Please try again." });
  }

  if (state.phase === "done") {
    return (
      <div className={`rounded-2xl border border-border p-6 ${className}`} role="status">
        <p className="flex items-center gap-2 font-semibold"><Check className="size-5" aria-hidden /> Check your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">We sent a confirmation link to {email}. Click it and your first Competitor ad watch arrives on Monday.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={`rounded-2xl border border-border p-6 text-left ${className}`}>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {description ?? "Every Monday, Komendly emails you the new Facebook and Instagram ads up to 5 competitors launched, each with a one-tap \"Make my version\". Weeks with nothing new are skipped."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Your email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="you@yourbusiness.com" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your trade</span>
          <input required value={trade} maxLength={60} onChange={(e) => setTrade(e.target.value)} className={field} placeholder="Plumber, roofer, dentist…" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Your city</span>
          <input required value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} className={field} placeholder="Austin, TX" />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">Competitors&apos; Facebook Pages (up to {MAX_PAGES})</legend>
          <div className="space-y-2">
            {pages.map((p, i) => (
              <input
                key={i}
                aria-label={`Competitor Facebook Page ${i + 1}`}
                inputMode="url"
                value={p}
                onChange={(e) => setPages((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                className={field}
                placeholder="facebook.com/theirbusiness"
              />
            ))}
          </div>
          {pages.length < MAX_PAGES && (
            <button type="button" onClick={() => setPages((l) => [...l, ""])} className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <Plus className="size-4" aria-hidden /> Add another competitor
            </button>
          )}
        </fieldset>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state.phase === "working"} className={btn}>
          {state.phase === "working" && <Loader2 className="size-4 animate-spin" aria-hidden />} Start my free ad watch
        </button>
        <p className="text-xs text-muted-foreground">From Komendly. We email a confirmation link first. Unsubscribe in one click anytime.</p>
      </div>
      {state.phase === "error" && <p role="alert" className="mt-3 text-sm text-[oklch(0.7_0.17_30)]">{state.error}</p>}
    </form>
  );
}

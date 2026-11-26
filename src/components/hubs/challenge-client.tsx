"use client";
// 60-second website-to-ad challenge. Honest scope: it times how fast you get from "no ad" to submitting your site to Komendly's
// free ad maker; it does not claim the ad is finished in 60 seconds. The result card (/challenge/r/<id>) is shareable.
import { useEffect, useRef, useState } from "react";
import { ShareLink } from "@/components/hubs/share-link";

const TOTAL = 60;
export function ChallengeClient() {
  const [token, setToken] = useState<string | null>(null);
  const [left, setLeft] = useState(TOTAL); const [url, setUrl] = useState("");
  const [res, setRes] = useState<{ id: string; ms: number } | null>(null); const [err, setErr] = useState<string | null>(null);
  const t0 = useRef(0);
  useEffect(() => {
    if (!token || res) return;
    const i = window.setInterval(() => { const s = TOTAL - Math.floor((Date.now() - t0.current) / 1000); setLeft(Math.max(0, s)); if (s <= 0) { window.clearInterval(i); setToken(null); setErr("Time's up! Try again."); } }, 250);
    return () => window.clearInterval(i);
  }, [token, res]);
  async function start() {
    setErr(null); setRes(null); setLeft(TOTAL);
    const r = await fetch("/api/hub/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phase: "start" }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { token?: string; error?: string } | null;
    if (j?.token) { t0.current = Date.now(); setToken(j.token); } else setErr(j?.error ?? "Not available right now.");
  }
  async function finish(e: React.FormEvent) {
    e.preventDefault(); if (!token) return;
    const r = await fetch("/api/hub/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phase: "finish", token, url, ms: Date.now() - t0.current }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { id?: string; ms?: number; error?: string } | null;
    if (j?.id) { setRes({ id: j.id, ms: j.ms ?? 0 }); } else setErr(j?.error ?? "Something went wrong.");
  }
  if (res) {
    const card = `/challenge/r/${res.id}`;
    return (
      <div className="rounded-2xl border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Website to ad brief in</p>
        <p className="font-display text-6xl">{(res.ms / 1000).toFixed(1)}s</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <a className="inline-flex h-11 items-center rounded-xl bg-[var(--studio-gold)] px-5 font-semibold text-[#2a0f10]" href={`/free-ads?url=${encodeURIComponent(url)}&utm_source=hub&utm_medium=acquire&utm_campaign=challenge`}>Make the ads for my site</a>
          <ShareLink url={card} text={`I got from my website to an ad brief in ${(res.ms / 1000).toFixed(1)}s with Komendly`} label="Share my time" />
        </div>
      </div>
    );
  }
  if (!token) return <div className="space-y-3"><button onClick={() => void start()} className="h-12 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10]">Start the 60-second clock</button>{err && <p role="alert" className="text-sm text-red-300">{err}</p>}</div>;
  return (
    <form onSubmit={finish} className="space-y-3">
      <p className="font-display text-5xl tabular-nums" aria-live="off">{left}s</p>
      <input autoFocus className="w-full rounded-xl border border-border bg-white/5 px-4 py-3 text-base outline-none focus:border-[var(--studio-gold)]" placeholder="yourbusiness.com" value={url} onChange={(e) => setUrl(e.target.value)} />
      <button className="h-12 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10]">Stop the clock</button>
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
    </form>
  );
}

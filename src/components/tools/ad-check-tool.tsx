"use client";

// Meta Ad Check form (/tools/meta-ad-check): queue a scan, poll until the engine finished it, then open the private
// report (/ad-check/<token>, carrying utm_source=ad_check so a first visit is attributed to the ad_check system).
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AD_CHECK_TRADES, US_STATES } from "@/lib/growth/ad-check";

const field = "w-full rounded-xl border border-border bg-white/5 px-4 py-3 text-base outline-none focus:border-[var(--studio-gold)]";
const btn = "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--studio-gold)] px-6 font-semibold text-[#2a0f10] transition hover:brightness-105 disabled:opacity-60";

export function AdCheckTool() {
  const [url, setUrl] = useState("");
  const [trade, setTrade] = useState("");
  const [state, setState] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setPhase("working");
    setError("");
    const r = await fetch("/api/ad-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, trade: trade || undefined, state: state || undefined }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { token?: string; error?: string } | null;
    if (!r?.ok || !j?.token) { setPhase("error"); setError(j?.error ?? "Something went wrong. Please try again."); return; }
    const report = `/ad-check/${j.token}?utm_source=ad_check&utm_medium=acquire&utm_campaign=meta-ad-check&utm_content=tool`;
    const started = Date.now();
    // Scans are rate-limited (one Ad Library request every 3 s, plus rivals): usually under a minute, up to a few.
    while (alive.current && Date.now() - started < 240_000) {
      await new Promise((res) => setTimeout(res, 3000));
      const p = (await fetch(`/api/ad-check/${j.token}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null)) as { status?: string } | null;
      if (p?.status === "done") { window.location.href = report; return; }
    }
    // Still queued: the report page keeps waiting and fills in once the scan is done.
    if (alive.current) window.location.href = report;
  }

  return (
    <form className="space-y-3" onSubmit={run}>
      <label className="block text-sm font-medium" htmlFor="adc-url">Your Facebook Page or website</label>
      <input id="adc-url" type="text" inputMode="url" required maxLength={300} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="facebook.com/yourpage or yourbusiness.com" className={field} />
      <div className="grid gap-3 sm:grid-cols-2">
        <select aria-label="Your trade (optional, for the local comparison)" value={trade} onChange={(e) => setTrade(e.target.value)} className={field}>
          <option value="">Trade (optional)</option>
          {AD_CHECK_TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Your state (optional, for the local comparison)" value={state} onChange={(e) => setState(e.target.value)} className={field}>
          <option value="">State (optional)</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <button className={btn} disabled={phase === "working"}>{phase === "working" ? <><Loader2 className="size-4 animate-spin" /> Reading the Ad Library…</> : "Check my ads"}</button>
      {phase === "working" && <p className="text-xs text-muted-foreground">This usually takes under a minute. Keep this tab open.</p>}
      {phase === "error" && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <p className="text-xs text-muted-foreground">Free, no sign-up. We only read the public Meta Ad Library; your report is private.</p>
    </form>
  );
}

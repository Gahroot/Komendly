"use client";
import { useState } from "react";

interface Tally { a: number; b: number; total: number; aPct: number; bPct: number }
export function VoteButtons({ pair, a, b, initial }: { pair: string; a: string; b: string; initial: Tally }) {
  const [t, setT] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);
  async function vote(choice: string) {
    const r = await fetch("/api/hub/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pair, choice }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { tally?: Tally; error?: string } | null;
    if (r?.ok && j?.tally) { setT(j.tally); setVoted(true); } else setMsg(j?.error ?? "Couldn't record your vote.");
  }
  const btn = "h-11 flex-1 rounded-xl border border-border font-semibold transition hover:bg-white/[0.08] disabled:opacity-60";
  return (
    <div className="mt-4 space-y-2">
      <div className="flex gap-3">
        <button className={btn} disabled={voted} onClick={() => void vote(a)}>Vote A{voted ? ` · ${t.aPct}% (${t.a})` : ""}</button>
        <button className={btn} disabled={voted} onClick={() => void vote(b)}>Vote B{voted ? ` · ${t.bPct}% (${t.b})` : ""}</button>
      </div>
      {msg && <p role="alert" className="text-sm text-red-300">{msg}</p>}
      <p className="text-xs text-muted-foreground">One vote per person per day. No account, no personal data stored.</p>
    </div>
  );
}

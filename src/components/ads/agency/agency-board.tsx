"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { RowView } from "@/lib/customer-intel/agency";

interface Result { brandId: string; name: string; status: string; message?: string }
const APPROVAL: Record<RowView["approval"], string> = { none: "Not sent", waiting: "Waiting for client", approved: "Approved", changes: "Changes requested" };

export function AgencyBoard(p: { rows: RowView[]; due: string[]; credits: number; dropCost: number; unlimited: boolean; pooled30d: number }) {
  const [sel, setSel] = useState<Set<string>>(new Set(p.due.slice(0, 10)));
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cost = p.unlimited ? 0 : sel.size * p.dropCost;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function run() {
    setBusy(true); setError(null); setResults(null);
    try {
      const r = await fetch("/api/ads/agency/drop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandIds: [...sel] }) });
      const j = await r.json();
      if (!r.ok) setError(j.message ?? j.error ?? "That didn't work. Try again in a minute."); else setResults(j.results);
    } catch { setError("That didn't work. Check your connection and try again."); }
    setBusy(false);
  }
  return (
    <div className="space-y-4">
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
        <div><b>{p.unlimited ? "Unlimited week active" : `${p.credits} credits in your pool`}</b><span className="text-muted-foreground"> · {p.pooled30d} used on clients in the last 30 days · one drop costs about {p.unlimited ? 0 : p.dropCost} credits per client</span></div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">{sel.size} selected{cost ? ` · ${cost} credits` : ""}</span>
          <Button disabled={busy || sel.size === 0} onClick={run}>{busy ? "Starting…" : `Make this week's drop for ${sel.size} client${sel.size === 1 ? "" : "s"}`}</Button>
        </div>
      </CardContent></Card>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {results && <Card><CardContent className="space-y-1 py-4 text-sm">{results.map((r) => <div key={r.brandId}><b>{r.name}</b>: {r.status === "started" ? "started" : r.status === "already_done" ? "already made this week" : r.message}</div>)}</CardContent></Card>}
      <div className="grid gap-3">
        {p.rows.map((r) => (
          <Card key={r.brandId}><CardContent className="flex flex-wrap items-center gap-4 py-4">
            <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.brandId)} onChange={() => toggle(r.brandId)} className="size-4" />
            <div className="min-w-48 flex-1">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.domain}</div>
            </div>
            <div className="text-xs text-muted-foreground">{r.latestRun ? <>Latest pack: {r.latestRun.status === "completed" || r.latestRun.status === "partial" ? `${r.latestRun.readyAds} ads` : r.latestRun.status}, {r.ageDays === 0 ? "today" : `${r.ageDays} days ago`}</> : "No pack yet"}</div>
            <div className="text-xs">{APPROVAL[r.approval]}</div>
            <div className="text-xs text-muted-foreground">{r.creditsUsed30d} credits / 30 days</div>
            <div className="min-w-56 text-sm"><Link href={r.latestRun ? `/ads/runs/${r.latestRun.id}` : r.next.href} className="underline">{r.next.title}</Link></div>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}

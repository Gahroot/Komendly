"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { placementLabel, type MetaStatus } from "@/lib/ads/meta/status-types";
import { MetaAccountPicker } from "./meta-account-picker";
import { MetaPublishStatus } from "./meta-publish-status";

/**
 * "Publish to Meta" for a completed run. Self-contained: fetches its own state; renders nothing
 * when the meta_publish flag is off. Mount: <MetaPublishDialog runId={run.id} />
 */
export function MetaPublishDialog({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [adAccountId, setAdAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (withAccounts: boolean, signal?: AbortSignal) => {
    const res = await fetch(`/api/ads/meta/status?runId=${encodeURIComponent(runId)}${withAccounts ? "&accounts=1" : ""}`, { signal, cache: "no-store" });
    if (res.status === 404) { setHidden(true); return; }
    if (!res.ok) { setError("Couldn't load Meta publishing."); return; }
    const s = (await res.json()) as MetaStatus;
    setStatus(s);
    if (s.access === "ok" && s.selection) {
      setAdAccountId((v) => v || s.selection?.adAccountId || "");
      setPageId((v) => v || s.selection?.pageId || "");
    }
  }, [runId]);

  useEffect(() => {
    const ac = new AbortController();
    load(false, ac.signal).catch(() => undefined);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    load(true, ac.signal).catch(() => undefined);
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && (e.data as { type?: string })?.type === "komendly:meta") load(true).catch(() => undefined);
    };
    window.addEventListener("message", onMsg);
    return () => { ac.abort(); window.removeEventListener("message", onMsg); };
  }, [open, load]);

  const pending = status?.access === "ok" && status.ads.some((a) => a.publishes.some((p) => p.status === "pending"));
  useEffect(() => {
    if (!open || !pending) return;
    const t = setInterval(() => { load(false).catch(() => undefined); }, 4000);
    return () => clearInterval(t);
  }, [open, pending, load]);

  if (hidden) return null;

  const connect = () => window.open("/api/ads/meta/connect", "komendly-meta", "width=600,height=760");
  const disconnect = async () => {
    await fetch("/api/ads/meta/disconnect", { method: "POST" });
    setAdAccountId(""); setPageId("");
    await load(false);
  };

  const publish = async () => {
    setBusy(true); setError(null);
    try {
      const major = Number(budget);
      const res = await fetch("/api/ads/meta/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, adIds: selected, adAccountId, pageId, budget: budget && major > 0 ? Math.round(major * 100) : undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error ?? "Publishing failed.");
      else { setSelected([]); await load(false); }
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!status}><Send /> Publish to Meta</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish to Meta</DialogTitle>
          <DialogDescription>Everything is created paused. Nothing spends until you turn it on in Ads Manager.</DialogDescription>
        </DialogHeader>

        {!status ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        ) : status.access === "upgrade" ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Publishing straight to Facebook and Instagram is part of the paid plans.</p>
            <Button asChild><Link href="/ads/billing">See plans</Link></Button>
          </div>
        ) : !status.connected ? (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Connect the Meta account that manages your ad account and Facebook Page.</p>
            <Button onClick={connect}>Connect Meta account</Button>
          </div>
        ) : (
          <div className="space-y-5">
            {status.accounts && "error" in status.accounts ? (
              <p className="text-sm text-destructive">{status.accounts.error}</p>
            ) : status.accounts ? (
              <MetaAccountPicker adAccounts={status.accounts.adAccounts} pages={status.accounts.pages}
                adAccountId={adAccountId} pageId={pageId} onAdAccount={setAdAccountId} onPage={setPageId} />
            ) : (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Ads</legend>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {status.ads.map((a) => (
                  <li key={a.id}>
                    <label className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${a.eligible ? "cursor-pointer hover:bg-accent" : "opacity-50"}`}>
                      <input type="checkbox" className="mt-0.5 accent-primary" disabled={!a.eligible} checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                      <span className="min-w-0">
                        <span className="block truncate">{a.headline}</span>
                        <span className="text-xs text-muted-foreground">
                          {a.kind === "motion" ? "Video" : "Image"} · {a.ratios.map((r) => `${r} → ${placementLabel(r)}`).join(", ")}
                          {!a.eligible && " · not ready"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="meta-budget">Daily budget per ad set (optional)</Label>
              <Input id="meta-budget" inputMode="decimal" placeholder="e.g. 20" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} />
              <p className="text-xs text-muted-foreground">In your ad account&apos;s currency. Stays paused either way; placements are set automatically by format.</p>
            </div>

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <MetaPublishStatus ads={status.ads} />
          </div>
        )}

        {status?.access === "ok" && status.connected && (
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="ghost" onClick={disconnect}>Disconnect</Button>
            <Button onClick={publish} disabled={busy || !selected.length || !adAccountId || !pageId}>
              {busy && <Loader2 className="animate-spin" />} Create {selected.length || ""} paused {selected.length === 1 ? "ad" : "ads"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney, fromMinorUnits } from "@/lib/ads/meta/publish-options";
import type { MetaAdView, MetaCampaignView } from "@/lib/ads/meta/status-types";
import { MetaPublishStatus } from "../meta-publish-status";

export function DoneStep({
  ads, campaigns, canActivate, currencyOf, onActivate,
}: {
  ads: MetaAdView[];
  campaigns: MetaCampaignView[];
  canActivate: boolean;
  currencyOf: (adAccountId: string | null) => string;
  onActivate: (campaignId: string) => Promise<string | null>;
}) {
  const rows = ads.flatMap((a) => a.publishes);
  const pending = rows.some((p) => p.status === "pending");
  const managerUrl = campaigns[0]?.adsManagerUrl ?? rows.find((p) => p.status === "published" && p.adsManagerUrl)?.adsManagerUrl ?? null;
  return (
    <div className="space-y-4 text-sm">
      <p className="flex items-center gap-2">
        {pending ? <><Loader2 className="size-4 animate-spin" /> Creating your paused ads in Meta. This takes a minute.</>
          : canActivate ? "Your ads are in Meta, paused. Check them in Ads Manager, then turn them on here or there."
          : "Your ads are in Meta, paused. Check them in Ads Manager, then turn them on there."}
      </p>
      {managerUrl && (
        <Button asChild variant="outline">
          <a href={managerUrl} target="_blank" rel="noreferrer">Open Ads Manager <ExternalLink /></a>
        </Button>
      )}
      {canActivate && !pending && campaigns.map((c) => (
        <TurnOn key={c.campaignId} campaign={c} currency={currencyOf(c.adAccountId)} onActivate={onActivate} />
      ))}
      <MetaPublishStatus ads={ads} />
    </div>
  );
}

function TurnOn({ campaign: c, currency, onActivate }: { campaign: MetaCampaignView; currency: string; onActivate: (id: string) => Promise<string | null> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const perSet = fromMinorUnits(c.dailyBudgetMinor, currency);
  const label = `${c.ads} ${c.ads === 1 ? "ad" : "ads"} in ${c.adSets} ${c.adSets === 1 ? "ad set" : "ad sets"}`;

  if (c.activation === "active") return <p className="rounded-md border border-border bg-card/50 px-3 py-2">Running: {label}. Manage or pause it in Ads Manager.</p>;
  if (c.activation === "activating") return <p className="flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2"><Loader2 className="size-4 animate-spin" /> Turning on {label}…</p>;

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const err = await onActivate(c.campaignId);
      if (err) setError(err); else setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-card/50 px-3 py-2">
      {c.activation === "failed" && <p className="text-destructive" role="alert">Couldn&apos;t turn it on: {c.activationError}</p>}
      {!confirming ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Paused: {label}</span>
          <Button size="sm" onClick={() => setConfirming(true)}><Power /> Turn on now</Button>
        </div>
      ) : (
        <div className="space-y-2" role="alertdialog" aria-label="Confirm turning ads on">
          <p className="font-medium">This starts spending real money.</p>
          <p>
            Up to <span className="font-medium">{formatMoney(perSet * c.adSets, currency)} a day</span> ({formatMoney(perSet, currency)} per ad set × {c.adSets}),
            charged by Meta to your ads account until you pause it in Ads Manager.
          </p>
          {error && <p className="text-destructive" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={confirm} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Yes, turn on</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

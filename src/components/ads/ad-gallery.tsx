"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AWARENESS_LEVELS, RATIOS, type Ratio } from "@/lib/ads/contracts";
import type { RunView } from "@/lib/ads/run-types";
import { track } from "@/lib/analytics/track";
import type { BonusSummary } from "@/lib/ads/bonus-access";
import { notifyAdDownloaded } from "@/lib/ads/offer-session";
import { AdCard } from "./ad-card";
import { useDownloadGate } from "./download-gate";
import { FeatureProvider } from "./feature-ad";
import { BonusSection } from "./locked-bonus-section";
import { AdFailedCard } from "./ad-failed-card";
import { AwarenessGroupHeader } from "./awareness-group-header";
import { AdSkeletonCard } from "./ad-skeleton-card";
import { FirstAdTimer } from "./first-ad-timer";
import { MetaPublishDialog } from "./meta-publish-dialog";

export function AdGallery({ run, offerOpen = false, remainingMs = null, unlockPack = false, offerReady = true }: { run: RunView; offerOpen?: boolean; remainingMs?: number | null; unlockPack?: boolean; offerReady?: boolean }) {
  const ratios = RATIOS.filter((r) => run.ratios.includes(r));
  const gate = useDownloadGate();
  const [ratio, setRatio] = useState<Ratio>(ratios.includes("4:5") ? "4:5" : (ratios[0] ?? "4:5"));
  // Trial bonus ads (locked or unlocked) live in their own section; without them everything below is unchanged.
  const bonusAds = run.ads.filter((a) => a.bonusKind).sort((a, b) => a.index - b.index);
  const mainAds = bonusAds.length ? run.ads.filter((a) => !a.bonusKind) : run.ads;
  const bonus: BonusSummary | null = run.bonus ?? null;
  const ready = mainAds.filter((a) => a.status === "ready").length;
  // Monthly fresh-ad runs (kind "nurture") hold only their locked fresh ad: no main pack to count.
  const freshOnly = bonusAds.length > 0 && bonusAds.every((a) => a.bonusKind === "fresh");
  const total = freshOnly ? mainAds.length : run.staticCount + run.motionCount;
  const missing = Math.max(0, total - mainAds.length);
  const done = ["completed", "partial", "failed", "canceled"].includes(run.status);
  const isFailed = (a: RunView["ads"][number]) => a.status === "failed_qc" || a.status === "failed";
  const rank = (a: RunView["ads"][number]) => (a.status === "ready" ? 0 : 1);
  const live = mainAds.filter((a) => !isFailed(a)).sort((a, b) => rank(a) - rank(b) || a.index - b.index);
  const groups = AWARENESS_LEVELS.map((l) => [l, live.filter((a) => a.awareness === l)] as const).filter(([, ads]) => ads.length > 0);
  const failed = mainAds.filter(isFailed).sort((a, b) => a.index - b.index);

  return (
    <FeatureProvider runId={run.id}>
    <section className="space-y-8">
      <div className="glass-float z-20 flex flex-col gap-3 rounded-2xl p-4 sm:sticky sm:top-16 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{done ? "Your ads" : "Building your ads"}</h2>
          {total > 0 && <div className="flex items-center gap-3" aria-live="polite">
            <Progress value={total ? (ready / total) * 100 : 0} className="h-1.5 w-28" />
            <p className="text-sm tabular-nums text-muted-foreground">{ready} of {total} ready</p>
          </div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FirstAdTimer confirmedAt={run.confirmedAt} firstAdAt={run.firstAdAt} />
          {ratios.length > 1 && (
            <Tabs value={ratio} onValueChange={(v) => setRatio(v as Ratio)}>
              <TabsList>
                {ratios.map((r) => <TabsTrigger key={r} value={r}>{r}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          )}
          {done && <MetaPublishDialog runId={run.id} />}
          <Button asChild disabled={ready === 0}>
            <a href={ready ? `/api/ads/runs/${run.id}/download` : undefined} aria-disabled={ready === 0} onClick={(e) => {
              if (!ready) return;
              if (gate.locked) {
                e.preventDefault();
                return gate.open();
              }
              track("ad_downloaded", { run_id: run.id, scope: "all", ready });
              notifyAdDownloaded(run.id);
            }}>
              <Download /> Download all
            </a>
          </Button>
        </div>
      </div>
      {run.status === "failed" && <p className="text-sm text-destructive">{run.error ?? "This run failed. Unused credits were refunded."}</p>}
      {groups.map(([level, ads]) => (
        <div key={level} className="space-y-4">
          <AwarenessGroupHeader level={level} count={ads.length} />
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
            {ads.map((ad) => <AdCard key={ad.id} ad={ad} ratio={ratio} runId={run.id} />)}
          </div>
        </div>
      ))}
      <BonusSection runId={run.id} ads={bonusAds} bonus={bonus} ratio={ratio} offerOpen={offerOpen} remainingMs={remainingMs} unlockPack={unlockPack} offerReady={offerReady} />
      {!done && missing > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Still planning · {missing}</p>
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
            {Array.from({ length: missing }, (_, i) => <AdSkeletonCard key={`s${i}`} ratio={ratio} label="Planning…" />)}
          </div>
        </div>
      )}
      {failed.length > 0 && !run.isTrial && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{failed.length} {failed.length === 1 ? "ad" : "ads"} held back</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{failed.map((ad) => <AdFailedCard key={ad.id} ad={ad} />)}</div>
        </div>
      )}
    </section>
    </FeatureProvider>
  );
}

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAdRun } from "@/hooks/useAdRun";
import { useAdsWorkspace } from "@/hooks/useAdsWorkspace";
import { useRunFunnelTracking } from "@/hooks/useRunFunnelTracking";
import { useOzzyRunSync } from "@/hooks/useOzzyRunSync";
import { RunCompanion } from "./run-companion";
import type { RunView } from "@/lib/ads/run-types";
import { AdGallery } from "./ad-gallery";
import { ExtractionReview } from "./extraction-review";
import { GenerateMoreForm } from "./generate-more-form";
import { RunProgress } from "./run-progress";
import { useLaunchOffer } from "@/hooks/useLaunchOffer";
import { OfferDownloadModal } from "./offer-download-modal";
import { OfferNudge } from "./offer-nudge";
import { TrialUpsell } from "./trial-upsell";
import { UnlockPackCard } from "./unlock-pack-offer";
import { LAUNCH_OFFER_MIN_READY } from "@/lib/ads/billing-config";
import { dismissedInSession, dismissInSession, noopSubscribe } from "@/lib/ads/offer-session";
import { freelancerValueLine, offerStateSettled, trialOfferStage } from "@/lib/ads/offer-value";
import { DownloadGateProvider } from "./download-gate";
import { GiftPackCard } from "@/components/growth/gift-pack-card";
import { bridgeVisible, pickBridgeAd } from "@/lib/studio/bridge";
import { StudioBridgeCard, StudioBridgeProvider } from "./studio-bridge";

/** Live run: extracting → review (30 s window) → generating → gallery. */
export function RunScreen({ initial }: { initial: RunView }) {
  const { data, mutate } = useAdRun(initial.id, initial);
  const { data: ws, mutate: mutateWs } = useAdsWorkspace();
  const recheckWs = useCallback(() => void mutateWs(), [mutateWs]);
  const refresh = useCallback(() => void mutate(), [mutate]);
  const run = data ?? initial;
  useRunFunnelTracking(run);
  useOzzyRunSync(run);
  const domain = run.extraction?.domain ?? new URL(run.url).hostname;
  const done = ["completed", "partial"].includes(run.status);
  const trialUnpaid = run.isTrial && ws !== undefined && !ws.isPaid;
  const offer = useLaunchOffer(trialUnpaid);
  const readyMain = run.ads.filter((a) => a.status === "ready" && !a.bonusKind).length;
  // The Launch Quarter window opens server-side at the 3rd ready ad: re-check eligibility as ads land.
  const refreshOffer = offer.refresh;
  const offerReached = trialUnpaid && readyMain >= LAUNCH_OFFER_MIN_READY && !offer.open;
  useEffect(() => {
    if (offerReached) void refreshOffer();
  }, [offerReached, readyMain, refreshOffer]);
  const lqKey = `launch_quarter:${run.id}`;
  const lqDismissedStored = useSyncExternalStore(noopSubscribe, () => dismissedInSession(lqKey), () => false);
  const [lqDismissedLocal, setLqDismissed] = useState(false);
  const dismissLaunch = useCallback(() => {
    dismissInSession(lqKey);
    setLqDismissed(true);
  }, [lqKey]);
  // One offer at a time: Launch Quarter while open (and not dismissed), then the $9 unlock while bonus ads are locked.
  const stage = trialOfferStage({ trialUnpaid, readyAds: readyMain, minReady: LAUNCH_OFFER_MIN_READY, launchOpen: offer.open, launchDismissed: lqDismissedStored || lqDismissedLocal, bonusLocked: Boolean(run.bonus?.locked), unlockAvailable: offer.unlockPack });
  const offerOpen = stage === "launch_quarter";
  // Wait for the server's offer state before any offer UI renders or logs "shown" (else it reads closed on first paint).
  const offerReady = offerStateSettled({ isTrial: run.isTrial, workspaceLoaded: ws !== undefined, isPaid: Boolean(ws?.isPaid), offerSettled: offer.settled });
  // Ozzy Studio bridge: only once the ads are ready, rendered below the gallery and the upsell (flag studio_bridge).
  // Anchor above the offer: what their ready (viewable) ads would cost from a freelancer.
  const viewable = run.ads.filter((a) => a.status === "ready" && !a.locked);
  const valueLine = freelancerValueLine({ static: viewable.filter((a) => a.kind !== "motion").length, motion: viewable.filter((a) => a.kind === "motion").length });
  const bridgeOn = bridgeVisible({ flag: run.studio?.bridge === true, runStatus: run.status, readyAds: readyMain });
  const bridgeAd = bridgeOn ? pickBridgeAd(run.ads) : null;

  let body: React.ReactNode;
  if (run.status === "extracting") body = <RunProgress phase="extracting" domain={domain} />;
  else if (run.status === "awaiting_confirm" && run.extraction) {
    body = <ExtractionReview key={`${run.retriesLeft}`} run={run} extraction={run.extraction} onChanged={refresh} />;
  } else if (run.status === "awaiting_confirm") body = <RunProgress phase="extracting" domain={domain} />;
  else if (run.status === "queued" && run.ads.length === 0) body = <RunProgress phase="planning" domain={domain} />;
  else if ((run.status === "failed" || run.status === "canceled") && run.ads.length === 0) {
    body = (
      <Card className="mx-auto max-w-md bg-card/70 backdrop-blur">
        <CardHeader>
          <CardTitle>We couldn&apos;t finish this run</CardTitle>
          <CardDescription>{run.error ?? "Something went wrong on our side. Any reserved credits were refunded."}</CardDescription>
        </CardHeader>
        <CardFooter><Button asChild><Link href="/ads/app">Back to home</Link></Button></CardFooter>
      </Card>
    );
  } else body = <AdGallery run={run} offerOpen={offerOpen} remainingMs={offer.remainingMs} unlockPack={stage === "unlock_pack"} offerReady={offerReady} />;
  const showEarlyOffer = offerReady && offerOpen && !done && run.ads.length > 0 && ["queued", "generating"].includes(run.status);

  return (
    <TooltipProvider>
      <StudioBridgeProvider enabled={bridgeOn}>
      <DownloadGateProvider isTrial={run.isTrial} isPaid={ws?.isPaid} emailVerified={ws?.emailVerified} email={ws?.email} recheck={recheckWs}>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <Link href="/ads/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="size-3.5" /> All runs
            </Link>
            <h1 className="truncate text-3xl font-semibold tracking-tight">{run.extraction?.brandName ?? domain}</h1>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="size-3.5" /><span className="truncate">{domain}</span>
              {run.isTrial && <span className="rounded-full border bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Free trial</span>}
            </p>
          </div>
          <div className="w-full sm:max-w-md"><RunCompanion run={run} domain={domain} /></div>
        </div>
        {body}
        {showEarlyOffer && <OfferNudge runId={run.id} ready={readyMain} bonus={run.bonus ?? null} remainingMs={offer.remainingMs} onDismiss={dismissLaunch} valueLine={valueLine} />}
        {offerReady && stage === "unlock_pack" && run.bonus && <UnlockPackCard runId={run.id} bonus={run.bonus} />}
        {offerReady && done && trialUnpaid && stage !== "unlock_pack" && <TrialUpsell runId={run.id} bonus={run.bonus ?? null} offerOpen={offerOpen} remainingMs={offer.remainingMs} onDecline={offerOpen ? dismissLaunch : undefined} valueLine={valueLine} />}
        {offerReady && done && trialUnpaid && <OfferDownloadModal runId={run.id} bonus={run.bonus ?? null} offerOpen={offerOpen} remainingMs={offer.remainingMs} />}
        {done && ws?.isPaid && <GenerateMoreForm url={run.url} brandProfileId={run.brandProfileId} />}
        {bridgeOn && <StudioBridgeCard placement="run_card" data={{ runId: run.id, domain, bestAdId: bridgeAd?.id ?? null, hasLogo: Boolean(run.logoUrl), freeVideosLeft: run.studio?.freeVideosLeft ?? 0 }} />}
        {done && run.ads.length > 0 && <GiftPackCard />}
      </div>
      </DownloadGateProvider>
      </StudioBridgeProvider>
    </TooltipProvider>
  );
}

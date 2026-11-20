"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { FREE_TRIAL_ADS } from "@/lib/ads/bonus-access";
import { UNLOCK_PACK } from "@/lib/ads/billing-config";
import type { BonusSummary } from "@/lib/ads/bonus-access";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { AD_DOWNLOADED_EVENT, modalShownForRun, modalShowsThisSession, recordModalShown } from "@/lib/ads/offer-session";
import { shouldShowOfferModal } from "@/lib/ads/offer-value";
import { LaunchQuarterCard, trackOfferView } from "./launch-quarter-card";

/**
 * Peak intent: right after the first download of a finished trial, once per run and max one modal per session.
 * With ads past the free pack limit it leads with the $9 unlock (autopilot plan funnel fix 2), even after the Launch window.
 */
export function OfferDownloadModal({ runId, bonus, offerOpen, remainingMs, lockedAds = 0, unlockAvailable = false, freeAds = null }: { runId: string; bonus: BonusSummary | null; offerOpen: boolean; remainingMs: number | null; lockedAds?: number; unlockAvailable?: boolean; freeAds?: number | null }) {
  const [open, setOpen] = useState(false);
  const unlockFirst = lockedAds > 0 && unlockAvailable;
  useEffect(() => {
    let timer: number | undefined;
    function onDownload() {
      if (!shouldShowOfferModal({ shownForRun: modalShownForRun(runId), shownThisSession: modalShowsThisSession(), offerOpen: offerOpen || unlockFirst })) return;
      recordModalShown(runId);
      // Let the browser start the download first.
      timer = window.setTimeout(() => {
        setOpen(true);
        trackOfferView("post_download");
        postOfferEvent("offer_modal_shown", { placement: "post_download", runId, locked: Boolean(bonus?.locked), lockedAds, unlockPack: unlockFirst });
      }, 1200);
    }
    window.addEventListener(AD_DOWNLOADED_EVENT, onDownload);
    return () => {
      window.removeEventListener(AD_DOWNLOADED_EVENT, onDownload);
      if (timer) window.clearTimeout(timer);
    };
  }, [runId, offerOpen, bonus?.locked, lockedAds, unlockFirst]);

  function onOpenChange(next: boolean) {
    if (!next) postOfferEvent("offer_dismissed", { placement: "post_download", runId });
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        {unlockFirst ? (
          <>
            <DialogTitle>Downloaded your {freeAds ?? FREE_TRIAL_ADS} free ads. {lockedAds} more {lockedAds === 1 ? "is" : "are"} ready.</DialogTitle>
            <DialogDescription>
              Unlock the other {lockedAds} for ${UNLOCK_PACK.priceCents / 100}, once. No subscription. You also get {UNLOCK_PACK.credits} credits for brand-new ads.
            </DialogDescription>
            <div onClickCapture={() => postOfferEvent("offer_clicked", { placement: "post_download", runId, offer: UNLOCK_PACK.key })}>
              <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: UNLOCK_PACK.key, placement: "post_download" }} label={`Unlock all ${lockedAds} for $${UNLOCK_PACK.priceCents / 100}`} />
            </div>
            {offerOpen ? (
              <>
                <p className="text-sm text-muted-foreground">Or let Ozzy run it: your ads go live in your own Meta account and the losers get replaced every week.</p>
                <LaunchQuarterCard placement="post_download" bonus={bonus} remainingMs={remainingMs} runId={runId} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Or let Ozzy run it: your ads go live in your own Meta account and the losers get replaced every week.{" "}
                <Link href="/ads/billing" className="font-medium text-foreground underline-offset-4 hover:underline">See Ozzy Ad Department</Link>
              </p>
            )}
          </>
        ) : (
          <>
            <DialogTitle>Downloaded. Want Ozzy to run your ads?</DialogTitle>
            <DialogDescription>
              Ozzy Ad Department puts your ads live in your own Meta account and replaces the losers every week{bonus?.locked ? ". It also unlocks your bonus ads now" : ""}.
            </DialogDescription>
            <LaunchQuarterCard placement="post_download" bonus={bonus} remainingMs={remainingMs} runId={runId} />
          </>
        )}
        <button type="button" onClick={() => onOpenChange(false)} className="text-sm text-muted-foreground underline-offset-4 hover:underline">Not now</button>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { BonusSummary } from "@/lib/ads/bonus-access";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { AD_DOWNLOADED_EVENT, modalShownForRun, modalShowsThisSession, recordModalShown } from "@/lib/ads/offer-session";
import { shouldShowOfferModal } from "@/lib/ads/offer-value";
import { LaunchQuarterCard, trackOfferView } from "./launch-quarter-card";

/** Peak intent: right after the first download of a finished trial, once per run and max one modal per session. */
export function OfferDownloadModal({ runId, bonus, offerOpen, remainingMs }: { runId: string; bonus: BonusSummary | null; offerOpen: boolean; remainingMs: number | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    function onDownload() {
      if (!shouldShowOfferModal({ shownForRun: modalShownForRun(runId), shownThisSession: modalShowsThisSession(), offerOpen })) return;
      recordModalShown(runId);
      // Let the browser start the download first.
      timer = window.setTimeout(() => {
        setOpen(true);
        trackOfferView("post_download");
        postOfferEvent("offer_modal_shown", { placement: "post_download", runId, locked: Boolean(bonus?.locked) });
      }, 1200);
    }
    window.addEventListener(AD_DOWNLOADED_EVENT, onDownload);
    return () => {
      window.removeEventListener(AD_DOWNLOADED_EVENT, onDownload);
      if (timer) window.clearTimeout(timer);
    };
  }, [runId, offerOpen, bonus?.locked]);

  function onOpenChange(next: boolean) {
    if (!next) postOfferEvent("offer_dismissed", { placement: "post_download", runId });
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogTitle>Downloaded. Want a fresh batch every month?</DialogTitle>
        <DialogDescription>
          Ads wear out. The {bonus?.locked ? "Founding Unlimited plan unlocks your bonus ads now and" : "Founding Unlimited plan"} keeps new ones coming, in every size including Stories/Reels.
        </DialogDescription>
        <LaunchQuarterCard placement="post_download" bonus={bonus} remainingMs={remainingMs} runId={runId} />
        <button type="button" onClick={() => onOpenChange(false)} className="text-sm text-muted-foreground underline-offset-4 hover:underline">Not now</button>
      </DialogContent>
    </Dialog>
  );
}

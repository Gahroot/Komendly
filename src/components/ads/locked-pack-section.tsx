"use client";
/* eslint-disable @next/next/no-img-element -- blurred thumbnails come from our own preview route */

import { useEffect } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { FREE_TRIAL_ADS } from "@/lib/ads/bonus-access";
import { LAUNCH_QUARTER, offerFirstPaymentCents, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { firstInSession } from "@/lib/ads/offer-session";
import type { AdView } from "@/lib/ads/run-types";
import { trackOfferView } from "./launch-quarter-card";

const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

function LockedAdCard({ ad }: { ad: AdView }) {
  return (
    <figure className="space-y-2.5">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border bg-muted shadow-sm">
        {ad.lockedPreviewUrl && <img src={ad.lockedPreviewUrl} alt="" aria-hidden loading="lazy" className="size-full scale-110 object-cover blur-sm" />}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/30 p-4 text-center">
          <span className="flex size-10 items-center justify-center rounded-full border bg-background/90 shadow-sm"><Lock className="size-4" /></span>
          <span className="text-sm font-medium">Ready. Unlock to download</span>
        </div>
      </div>
      {ad.headline && <figcaption className="line-clamp-2 px-1 text-sm font-medium leading-snug text-muted-foreground">{ad.headline}</figcaption>}
    </figure>
  );
}

/** Trial ads past the free pack limit: blurred, with the $9 unlock and the Ad Department offer. Renders nothing when none are locked. */
export function LockedPackSection({ runId, ads, unlockAvailable, freeAds }: { runId: string; ads: AdView[]; unlockAvailable: boolean; freeAds?: number | null }) {
  const ready = ads.filter((a) => a.status === "ready");
  useEffect(() => {
    if (ready.length === 0 || !firstInSession(`locked_pack_shown:${runId}`)) return;
    trackOfferView("unlock_pack");
    postOfferEvent("locked_bonus_shown", { placement: "locked_pack", runId, locked: ready.length, unlockPack: unlockAvailable });
  }, [ready.length, runId, unlockAvailable]);
  if (ready.length === 0) return null;
  const n = ready.length;

  return (
    <section className="space-y-4" aria-labelledby="locked-pack-title">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 id="locked-pack-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Lock className="size-4 text-primary" aria-hidden /> {n} more {n === 1 ? "ad is" : "ads are"} ready
          </h3>
          <p className="text-sm text-muted-foreground">
            Your free pack includes {freeAds ?? FREE_TRIAL_ADS} ads. {unlockAvailable ? `Unlock the other ${n} for ${usd(UNLOCK_PACK.priceCents)}, once. No subscription.` : "Any plan unlocks the rest."}
          </p>
          <p className="text-sm text-muted-foreground">
            Or let Ozzy run it: your ads go live in your own Meta account and the losers get replaced every week. {usd(offerFirstPaymentCents(LAUNCH_QUARTER))} the first month.{" "}
            <Link href="/ads/billing" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => postOfferEvent("offer_clicked", { placement: "locked_pack", runId, offer: "plans" })}>See Ozzy Ad Department</Link>
          </p>
        </div>
        {unlockAvailable && (
          <div className="w-full shrink-0 sm:w-60" onClickCapture={() => postOfferEvent("offer_clicked", { placement: "locked_pack", runId, offer: UNLOCK_PACK.key })}>
            <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: UNLOCK_PACK.key, placement: "unlock_pack" }} label={`Unlock all ${n} for ${usd(UNLOCK_PACK.priceCents)}`} />
          </div>
        )}
      </div>
      <div className="grid items-start gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {ready.map((ad) => <LockedAdCard key={ad.id} ad={ad} />)}
      </div>
    </section>
  );
}

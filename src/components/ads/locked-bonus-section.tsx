"use client";
/* eslint-disable @next/next/no-img-element -- presigned bucket URLs via redirect */

import { useEffect } from "react";
import Link from "next/link";
import { Film, Lock, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillingActionButton } from "@/app/ads/billing/_components/billing-action-button";
import { LAUNCH_QUARTER, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { bonusLabel, type BonusSummary } from "@/lib/ads/bonus-access";
import { postOfferEvent } from "@/lib/ads/offer-client";
import { firstInSession } from "@/lib/ads/offer-session";
import type { Ratio } from "@/lib/ads/contracts";
import type { AdView } from "@/lib/ads/run-types";
import { AdCard } from "./ad-card";
import { AdSkeletonCard } from "./ad-skeleton-card";
import { OfferCountdown, trackOfferView } from "./launch-quarter-card";

/** One locked bonus tile: only the blurred preview poster, with a lock overlay. */
function LockedBonusCard({ ad }: { ad: AdView }) {
  const isStory = ad.bonusKind === "story";
  return (
    <figure className="space-y-2.5">
      <div className={`relative overflow-hidden rounded-2xl border bg-muted shadow-sm ${isStory ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
        {ad.lockedPreviewUrl && <img src={ad.lockedPreviewUrl} alt="" aria-hidden loading="lazy" className="size-full scale-110 object-cover blur-md" />}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 p-4 text-center backdrop-blur-[2px]">
          <span className="flex size-10 items-center justify-center rounded-full border bg-background/90 shadow-sm"><Lock className="size-4" /></span>
          <span className="text-sm font-medium">{ad.bonusKind === "fresh" ? "Unlock with any plan" : `Unlock with ${LAUNCH_QUARTER.name}`}</span>
        </div>
        <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border bg-background/85 px-2 py-0.5 text-xs font-medium backdrop-blur">
          {isStory ? <><Smartphone className="size-3" /> Stories 9:16</> : <><Film className="size-3" /> Animated</>}
        </span>
      </div>
      <figcaption className="px-1 text-sm font-medium leading-snug text-muted-foreground">{isStory ? "Stories/Reels version" : "Bonus video"}</figcaption>
    </figure>
  );
}

/** Trial bonus ads. Locked: previews + count + offer CTA. Unlocked (paid): normal cards. Renders nothing without bonus ads. */
export function BonusSection({ runId, ads, bonus, ratio, offerOpen, remainingMs, unlockPack = false, offerReady = true }: {
  runId: string;
  ads: AdView[];
  bonus: BonusSummary | null;
  ratio: Ratio;
  offerOpen: boolean;
  remainingMs: number | null;
  /** The $9 downsell is the current offer (Launch Quarter dismissed or closed). */
  unlockPack?: boolean;
  /** Server offer state loaded: until then no offer CTA and no "shown" event. */
  offerReady?: boolean;
}) {
  const locked = Boolean(bonus?.locked);
  useEffect(() => {
    if (!offerReady || !bonus?.locked || !firstInSession(`locked_shown:${runId}`)) return;
    trackOfferView("locked_bonus", { stories: bonus.stories, videos: bonus.videos });
    postOfferEvent("locked_bonus_shown", { placement: "locked_bonus", runId, stories: bonus.stories, videos: bonus.videos, offerOpen });
  }, [bonus, runId, offerOpen, offerReady]);
  if (ads.length === 0) return null;
  const readyAds = ads.filter((a) => a.status === "ready");
  const pending = ads.filter((a) => a.status !== "ready" && a.status !== "failed" && a.status !== "failed_qc");

  return (
    <section className="space-y-4" aria-labelledby="bonus-title">
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 id="bonus-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            {locked && <Lock className="size-4 text-primary" aria-hidden />}
            {bonus ? `${bonusLabel(bonus)} ${bonus.stories + bonus.videos + (bonus.fresh ?? 0) === 1 ? "is" : "are"} ready for you` : "Your bonus ads are on the way"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {locked ? (bonus?.fresh ? "Ozzy made it from your current website. Any plan or credit pack unlocks it." : "Made from your site in the sizes and formats your free pack doesn't include.") : "Bonus ads unlocked with your plan."}
          </p>
          {locked && offerOpen && <OfferCountdown remainingMs={remainingMs} className="text-primary" />}
        </div>
        {locked && offerReady && (
          <div className="w-full shrink-0 sm:w-64" onClickCapture={() => postOfferEvent("offer_clicked", { placement: "locked_bonus", runId, offer: offerOpen ? LAUNCH_QUARTER.key : unlockPack ? UNLOCK_PACK.key : "plans" })}>
            {offerOpen ? (
              <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "offer", key: LAUNCH_QUARTER.key, placement: "locked_bonus" }} label={`Unlock with ${LAUNCH_QUARTER.name}`} />
            ) : unlockPack ? (
              <BillingActionButton endpoint="/api/ads-billing/checkout" body={{ kind: "topup", key: UNLOCK_PACK.key, placement: "unlock_pack" }} label={`Unlock this pack for $${UNLOCK_PACK.priceCents / 100}`} />
            ) : (
              <Button asChild className="w-full"><Link href="/ads/billing">Unlock with any plan</Link></Button>
            )}
          </div>
        )}
      </div>
      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
        {readyAds.map((ad) => (ad.locked ? <LockedBonusCard key={ad.id} ad={ad} /> : <AdCard key={ad.id} ad={ad} ratio={ratio} runId={runId} />))}
        {pending.map((ad) => <AdSkeletonCard key={ad.id} ratio={ad.bonusKind === "story" ? "9:16" : "4:5"} label="Bonus rendering…" />)}
      </div>
    </section>
  );
}

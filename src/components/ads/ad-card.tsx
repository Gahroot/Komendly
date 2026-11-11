"use client";

import { useState } from "react";
import { Download, Film, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Ratio } from "@/lib/ads/contracts";
import type { AdView } from "@/lib/ads/run-types";
import { notifyAdDownloaded } from "@/lib/ads/offer-session";
import { AdLightbox } from "./ad-lightbox";
import { useDownloadGate } from "./download-gate";
import { AdMedia } from "./ad-media";
import { AdSkeletonCard } from "./ad-skeleton-card";
import { FeatureAdButton, FeaturedBadge } from "./feature-ad";
import { StudioBridgeAction } from "./studio-bridge";

/** Angle without a leading raw awareness enum (e.g. "problem_aware — ..."). */
function cleanAngle(angle: string): string {
  return angle.replace(/^\s*[a-z]+_[a-z_]+\s*[—–:-]+\s*/, "");
}

const ACTION = "size-8 rounded-full border bg-background/85 shadow-sm backdrop-blur hover:bg-background";

/** Creative-first tile: the ad dominates, actions appear on hover (always visible on touch). */
export function AdCard({ ad, ratio, runId }: { ad: AdView; ratio: Ratio; runId?: string }) {
  const [open, setOpen] = useState(false);
  const gate = useDownloadGate();
  if (ad.status !== "ready") return <AdSkeletonCard ratio={ratio} label={ad.status === "planned" ? "Planned" : ad.status === "qc" ? "Quality check…" : "Rendering…"} />;
  const isMotion = ad.kind === "motion";
  const asset = isMotion ? ad.assets.find((a) => a.mime.startsWith("video/")) : (ad.assets.find((a) => a.ratio === ratio) ?? ad.assets[0]);
  const poster = isMotion ? ad.assets.find((a) => a.mime.startsWith("image/"))?.previewUrl : undefined;
  const view = { ...ad, angle: cleanAngle(ad.angle) };
  return (
    <figure className="group space-y-2.5">
      <div className="relative overflow-hidden rounded-2xl border bg-muted shadow-sm transition duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-md">
        {asset && (isMotion ? (
          <AdMedia asset={asset} poster={poster} alt={ad.headline} />
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="block w-full cursor-zoom-in focus-visible:outline-none" aria-label={`View ${ad.headline} full size`}>
            <AdMedia asset={asset} alt={ad.headline} />
          </button>
        ))}
        {isMotion && (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border bg-background/85 px-2 py-0.5 text-xs font-medium backdrop-blur">
            <Film className="size-3" /> Animated
          </span>
        )}
        <FeaturedBadge adId={ad.id} />
        <div className="absolute right-3 top-3 flex gap-1.5 transition duration-200 ease-out sm:translate-y-1 sm:opacity-0 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
          <FeatureAdButton adId={ad.id} />
          {!isMotion && (
            <Button type="button" variant="ghost" size="icon" className={ACTION} onClick={() => setOpen(true)} aria-label="View full size">
              <Maximize2 className="size-4" />
            </Button>
          )}
          {asset && (
            <Button asChild variant="ghost" size="icon" className={ACTION}>
              <a href={asset.downloadUrl} download onClick={(e) => {
                if (gate.locked) {
                  e.preventDefault();
                  return gate.open();
                }
                notifyAdDownloaded(runId);
              }} aria-label={`Download ${isMotion ? "MP4" : asset.ratio}`}><Download className="size-4" /></a>
            </Button>
          )}
        </div>
      </div>
      <figcaption className="space-y-0.5 px-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{ad.headline}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{view.angle}</p>
        {!ad.locked && <StudioBridgeAction adId={ad.id} motion={isMotion} placement="ad_card" className="-ml-0.5" />}
      </figcaption>
      {!isMotion && open && <AdLightbox ad={view} initialRatio={ratio} open={open} onOpenChange={setOpen} />}
    </figure>
  );
}

/* eslint-disable @next/next/no-img-element -- presigned bucket URLs via redirect; next/image can't optimise them */
import type { AdAssetView } from "@/lib/ads/run-types";

const ASPECT: Record<string, string> = { "4:5": "aspect-[4/5]", "1:1": "aspect-square", "9:16": "aspect-[9/16]" };

/** Whole creative at its true ratio (never cropped); videos use the ad's still as poster. */
export function AdMedia({ asset, poster, alt, className = "" }: { asset: AdAssetView; poster?: string; alt: string; className?: string }) {
  const aspect = ASPECT[asset.ratio] ?? "aspect-square";
  if (asset.mime.startsWith("video/")) {
    return <video src={asset.previewUrl} poster={poster} controls playsInline preload="metadata" className={`${aspect} w-full bg-muted object-contain ${className}`} />;
  }
  return <img src={asset.previewUrl} alt={alt} loading="lazy" className={`${aspect} w-full bg-muted object-contain ${className}`} />;
}

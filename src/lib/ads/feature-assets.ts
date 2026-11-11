// Public images of ads whose owners consented to be shown (Ad of the week + /ad-examples galleries).
// Only AdsFeature status consented | shortlisted | featured is served; declined/withdrawn/no row = 404.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getObjectStream } from "./storage";

export const PUBLIC_FEATURE_STATUSES = ["consented", "shortlisted", "featured"] as const;

export function isPublicFeatureStatus(status: string | null | undefined): boolean {
  return (PUBLIC_FEATURE_STATUSES as readonly string[]).includes(status ?? "");
}

/** Image asset to show publicly (prefers 4:5, then 1:1). */
export function pickFeatureAsset<T extends { mime: string; ratio: string }>(assets: readonly T[], ratio?: string): T | undefined {
  const images = assets.filter((a) => a.mime.startsWith("image/"));
  return (ratio ? images.find((a) => a.ratio === ratio) : undefined) ?? images.find((a) => a.ratio === "4:5") ?? images.find((a) => a.ratio === "1:1") ?? images[0];
}

/** Public URL of a consented ad's image (served by /api/ad-of-the-week/<adId>). */
export function publicFeatureImageUrl(adId: string, ratio?: string): string {
  return `/api/ad-of-the-week/${encodeURIComponent(adId)}${ratio ? `?ratio=${encodeURIComponent(ratio)}` : ""}`;
}

/** Route body: stream the ad's image if its owner consented, else 404. */
export async function servePublicFeatureImage(adId: string, opts: { ratio?: string; signal?: AbortSignal } = {}): Promise<NextResponse> {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  const feature = await prisma.adsFeature.findUnique({ where: { adId }, select: { status: true } });
  if (!isPublicFeatureStatus(feature?.status)) return notFound();
  const assets = await prisma.adAsset.findMany({ where: { adId }, select: { storageKey: true, mime: true, ratio: true }, orderBy: { createdAt: "asc" } });
  const asset = pickFeatureAsset(assets, opts.ratio);
  if (!asset) return notFound();
  try {
    const body = await getObjectStream(asset.storageKey, opts.signal);
    // Short cache: a withdrawal must take effect quickly.
    return new NextResponse(body, { headers: { "Content-Type": asset.mime, "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    console.error("[feature-assets] image failed", err);
    return notFound();
  }
}

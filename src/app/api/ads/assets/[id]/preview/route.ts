import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/ads/storage";
import { canServeAsset } from "@/lib/ads/bonus-access";
import { isBonusUnlocked } from "@/lib/ads/bonus-unlock";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

/** Stable preview URL for <img>/<video>: redirects to a short-lived presigned URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { workspace } = await requireWorkspaceMember({ assetId: id });
    const asset = await prisma.adAsset.findUniqueOrThrow({ where: { id }, include: { ad: { select: { visualBrief: true } } } });
    const unlocked = await isBonusUnlocked(workspace);
    if (!canServeAsset({ visualBrief: asset.ad.visualBrief, assetRatio: asset.ratio, unlocked, use: "preview" })) {
      throw new AdsHttpError(403, "locked", "Unlock this bonus ad with the Launch Quarter or any paid plan.");
    }
    return NextResponse.redirect(await presignGet(asset.storageKey, { seconds: 600 }), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

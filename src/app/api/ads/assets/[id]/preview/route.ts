import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { getObjectStream, presignGet } from "@/lib/ads/storage";
import { canServeAsset } from "@/lib/ads/bonus-access";
import { isBonusUnlocked, trialLockedIdsForRun } from "@/lib/ads/bonus-unlock";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

export const runtime = "nodejs";

async function blurredThumb(storageKey: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = (await getObjectStream(storageKey)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const out = await sharp(Buffer.concat(chunks)).resize({ width: 240, withoutEnlargement: true }).blur(9).jpeg({ quality: 55 }).toBuffer();
  return new Uint8Array(out);
}

/**
 * Stable preview URL for <img>/<video>: redirects to a short-lived presigned URL.
 * Trial ads past the free pack limit only ever get a small blurred JPEG (never the file), whatever the query says.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { workspace } = await requireWorkspaceMember({ assetId: id });
    const asset = await prisma.adAsset.findUniqueOrThrow({ where: { id }, include: { ad: { select: { visualBrief: true, runId: true } } } });
    const unlocked = await isBonusUnlocked(workspace);
    if (!canServeAsset({ visualBrief: asset.ad.visualBrief, assetRatio: asset.ratio, unlocked, use: "preview" })) {
      throw new AdsHttpError(403, "locked", "Unlock this bonus ad with Ozzy Ad Department or any paid plan.");
    }
    if ((await trialLockedIdsForRun(asset.ad.runId, unlocked)).has(asset.adId)) {
      if (!asset.mime.startsWith("image/")) throw new AdsHttpError(403, "locked", "Unlock the rest of your pack for $9, or with any paid plan.");
      return new NextResponse(Buffer.from(await blurredThumb(asset.storageKey)), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" } });
    }
    return NextResponse.redirect(await presignGet(asset.storageKey, { seconds: 600 }), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

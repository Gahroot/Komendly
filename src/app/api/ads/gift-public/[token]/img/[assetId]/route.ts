import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { giftByToken } from "@/lib/ads/gifts";
import { getObjectStream } from "@/lib/ads/storage";

/** Gift ad images for the public gift page and its OG image: the token must own the asset's run. Streams from S3. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await params;
  const gift = await giftByToken(token);
  if (!gift?.runId) return new NextResponse("Not found", { status: 404 });
  const asset = await prisma.adAsset.findUnique({ where: { id: assetId }, select: { storageKey: true, mime: true, expiresAt: true, ad: { select: { runId: true, status: true } } } });
  if (!asset || asset.ad.runId !== gift.runId || asset.ad.status !== "ready" || !asset.mime.startsWith("image/") || (asset.expiresAt && asset.expiresAt < new Date())) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const body = await getObjectStream(asset.storageKey);
    return new NextResponse(body, { headers: { "Content-Type": asset.mime, "Cache-Control": "public, max-age=86400, immutable", "X-Robots-Tag": "noindex" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

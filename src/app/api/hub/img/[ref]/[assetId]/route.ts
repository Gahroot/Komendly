import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adIdsForRef } from "@/lib/growth/creative-hubs-server";
import { getObjectStream } from "@/lib/ads/storage";

/** Ad images for capability pages: ref = a.<approve token> | s.<showcase slug, opted in> | m.<public makeover id>. */
export async function GET(_r: Request, { params }: { params: Promise<{ ref: string; assetId: string }> }) {
  const { ref, assetId } = await params;
  const ids = await adIdsForRef(decodeURIComponent(ref));
  if (!ids) return new NextResponse("Not found", { status: 404 });
  const asset = await prisma.adAsset.findUnique({ where: { id: assetId }, select: { storageKey: true, mime: true, expiresAt: true, adId: true, ad: { select: { status: true } } } });
  if (!asset || !ids.includes(asset.adId) || asset.ad.status !== "ready" || !asset.mime.startsWith("image/") || (asset.expiresAt && asset.expiresAt < new Date())) return new NextResponse("Not found", { status: 404 });
  try {
    return new NextResponse(await getObjectStream(asset.storageKey), { headers: { "Content-Type": asset.mime, "Cache-Control": ref.startsWith("a.") ? "private, max-age=600" : "public, max-age=3600", "X-Robots-Tag": "noindex" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}

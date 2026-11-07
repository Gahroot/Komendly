import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { extensionForMime, presignGet } from "@/lib/ads/storage";
import { adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, workspace } = await requireWorkspaceMember({ assetId: id });
    const asset = await prisma.adAsset.findUniqueOrThrow({ where: { id }, include: { ad: { select: { index: true, runId: true, awareness: true } } } });
    const name = `ad-${String(asset.ad.index + 1).padStart(2, "0")}-${asset.ad.awareness}-${asset.ratio.replace(":", "x")}.${extensionForMime(asset.mime)}`;
    const url = await presignGet(asset.storageKey, { seconds: 300, downloadName: name });
    await trackAdsEvent("export_downloaded", { workspaceId: workspace.id, userId: user.id, runId: asset.ad.runId, props: { kind: "asset", assetId: id, ratio: asset.ratio } });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

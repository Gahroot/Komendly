import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/ads/storage";
import { adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

/** Stable preview URL for <img>/<video>: redirects to a short-lived presigned URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireWorkspaceMember({ assetId: id });
    const asset = await prisma.adAsset.findUniqueOrThrow({ where: { id } });
    return NextResponse.redirect(await presignGet(asset.storageKey, { seconds: 600 }), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

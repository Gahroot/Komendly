import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { giftView } from "@/lib/ads/gifts";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

/** One of my gifts (polled by the progress screen). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const gift = await prisma.adsGift.findFirst({ where: { id: (await params).id, senderWorkspaceId: ws.id } });
    if (!gift) throw new AdsHttpError(404, "not_found", "Not found.");
    return NextResponse.json(await giftView(gift), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

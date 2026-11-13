import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import { reviewView } from "@/lib/ads/coach/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ws = await getOrCreateWorkspace(await requireUser());
    const { id } = await params;
    const r = await prisma.adCoachReview.findFirst({ where: { id, workspaceId: ws.id } });
    if (!r) throw new AdsHttpError(404, "not_found", "Not found.");
    return NextResponse.json({ review: reviewView(r) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

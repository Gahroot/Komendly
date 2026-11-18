// "Remove Komendly branding" setting (viral_branding). Paid-only: free/trial output always carries the mark.
// Affects new renders only; already-rendered assets stay as they are.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isPaidForBranding } from "@/lib/growth/viral-branding";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ removeBranding: z.boolean() });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "bad_request", "removeBranding (boolean) is required.");
    if (!isPaidForBranding(ws)) throw new AdsHttpError(402, "paid_only", "Removing the Komendly branding is included in every paid plan.");
    const { removeBranding } = parsed.data;
    await prisma.adsBrandingSetting.upsert({ where: { workspaceId: ws.id }, create: { workspaceId: ws.id, removeBranding }, update: { removeBranding } });
    return NextResponse.json({ removeBranding });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

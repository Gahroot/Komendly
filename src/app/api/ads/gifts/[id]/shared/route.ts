import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ channel: z.enum(["copy", "sms", "whatsapp", "email", "native"]) });

/** Client beacon: the sender copied/shared the gift link (AdsEvent gift_shared, props.channel). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Invalid channel.");
    const ws = await getOrCreateWorkspace(user);
    const gift = await prisma.adsGift.findFirst({ where: { id: (await params).id, senderWorkspaceId: ws.id }, select: { id: true } });
    if (!gift) throw new AdsHttpError(404, "not_found", "Not found.");
    await trackAdsEvent("gift_shared", { workspaceId: ws.id, userId: user.id, props: { giftId: gift.id, channel: parsed.data.channel } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

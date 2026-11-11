import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createGift, CreateGiftSchema, giftQuotaFor, giftView } from "@/lib/ads/gifts";
import { firstName } from "@/lib/ads/referrals";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

/** My gift packs + whether I can send another. */
export async function GET() {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const [rows, quota] = await Promise.all([
      prisma.adsGift.findMany({ where: { senderWorkspaceId: ws.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      giftQuotaFor(user, ws),
    ]);
    return NextResponse.json({ gifts: await Promise.all(rows.map(giftView)), quota, senderName: user.name ? firstName(user.name) : "", emailVerified: Boolean(user.emailVerifiedAt) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = CreateGiftSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Add their website and your first name.");
    const ws = await getOrCreateWorkspace(user);
    return NextResponse.json(await createGift(parsed.data, { user, workspace: ws }), { status: 201 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

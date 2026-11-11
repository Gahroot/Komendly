// Admin outreach gift pack: same createGift() as users; admins get source 'admin_outreach' (unlimited).
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { trackAdsEvent } from "@/lib/ads/events";
import { CreateGiftSchema, createGift } from "@/lib/ads/gifts";
import { adsErrorResponse, getOrCreateWorkspace } from "@/lib/ads/workspace";

export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const parsed = CreateGiftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  try {
    const workspace = await getOrCreateWorkspace(admin.user);
    const gift = await createGift(parsed.data, { user: admin.user, workspace });
    await trackAdsEvent("admin_outreach_gift", { workspaceId: workspace.id, userId: admin.user.id, props: { giftId: gift.id, actorId: admin.user.id } });
    return NextResponse.json(gift);
  } catch (error) {
    return adsErrorResponse(error);
  }
}

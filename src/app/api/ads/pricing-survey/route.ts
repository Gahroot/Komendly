import { NextResponse } from "next/server";
import { trackAdsEvent } from "@/lib/ads/events";
import { pricingSurveySchema } from "@/lib/ads/pricing-survey-schema";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = pricingSurveySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid answers" }, { status: 400 });
    const ws = await getOrCreateWorkspace(user);
    const existing = await prisma.adsEvent.findFirst({ where: { name: "pricing_survey", workspaceId: ws.id }, select: { id: true } });
    if (existing) return NextResponse.json({ ok: true, duplicate: true });
    await trackAdsEvent("pricing_survey", { workspaceId: ws.id, userId: user.id, props: parsed.data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

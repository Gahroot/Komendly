import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isBotUserAgent } from "@/lib/ads/gifts";
import { recordHumanClick } from "@/lib/ads/outbound/server";
import { clientIpFromHeaders, isMetaIp } from "@/lib/ads/meta-ip";

/** View beacon for the Kly review-video gift page (/gift/review/<token>): counts real views (not bots/scanners) and the lead's click. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token) || isBotUserAgent(request.headers.get("user-agent")) || isMetaIp(clientIpFromHeaders(request.headers))) {
    return NextResponse.json({ counted: false }, { headers: { "Cache-Control": "no-store" } });
  }
  const g = await prisma.klyReviewGift.findUnique({ where: { token }, select: { id: true, viewedAt: true } }).catch(() => null);
  if (g) {
    await prisma.klyReviewGift.update({ where: { id: g.id }, data: { viewCount: { increment: 1 }, viewedAt: g.viewedAt ?? new Date() } });
    await recordHumanClick(token).catch((e: unknown) => console.error("[kly] review gift click failed", e));
  }
  return NextResponse.json({ counted: Boolean(g) }, { headers: { "Cache-Control": "no-store" } });
}

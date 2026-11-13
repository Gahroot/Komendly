import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackAdsEvent } from "@/lib/ads/events";
import { giftByToken, isBotUserAgent } from "@/lib/ads/gifts";
import { clientIpFromHeaders, isMetaIp } from "@/lib/ads/meta-ip";

const Body = z.object({ channel: z.enum(["copy", "sms", "whatsapp", "email", "native"]) });

/** Public beacon from /gift/<token>: the recipient copied/shared the "make one for a business you know" link (AdsEvent gift_passed_on). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  if (isBotUserAgent(request.headers.get("user-agent")) || isMetaIp(clientIpFromHeaders(request.headers))) return NextResponse.json({ ok: true });
  const gift = await giftByToken(token).catch(() => null);
  if (!gift) return NextResponse.json({ ok: false }, { status: 404 });
  await trackAdsEvent("gift_passed_on", { workspaceId: gift.senderWorkspaceId, props: { giftId: gift.id, channel: parsed.data.channel } });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

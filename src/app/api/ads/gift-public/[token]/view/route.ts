import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordGiftView } from "@/lib/ads/gifts";
import { clientIpFromHeaders, isMetaIp } from "@/lib/ads/meta-ip";

/** Public view beacon from /gift/<token> (the page itself is cached, so views are counted here). Skips bots and the sender. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const viewer = await getCurrentUser().catch(() => null);
  const counted = await recordGiftView(token, {
    ua: request.headers.get("user-agent"),
    isMetaIp: isMetaIp(clientIpFromHeaders(request.headers)),
    viewerUserId: viewer?.id ?? null,
  }).catch(() => false);
  return NextResponse.json({ counted }, { headers: { "Cache-Control": "no-store" } });
}

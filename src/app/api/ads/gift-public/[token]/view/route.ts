import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordGiftView } from "@/lib/ads/gifts";
import { startGiftEncore, startOnClickRun } from "@/lib/kly/encore";
import { recordHumanClick } from "@/lib/ads/outbound/server";
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
  // Outbound gifts: a real person is looking (JS ran, not a link scanner), so Ozzy draws 2 more ads live.
  if (counted) await recordHumanClick(token).catch((e: unknown) => console.error("[kly] click record failed", e));
  // On-click gifts: the first real view starts the drawing; otherwise the 2-ad encore on top of the hook ad.
  const drawn = counted ? await startOnClickRun(token).catch((e: unknown) => (console.error("[kly] on-click run failed", e), null)) : null;
  const encore = counted && !drawn ? await startGiftEncore(token).catch((e: unknown) => (console.error("[kly] encore failed", e), null)) : null;
  return NextResponse.json({ counted, drawing: Boolean(drawn), encore: Boolean(encore) }, { headers: { "Cache-Control": "no-store" } });
}

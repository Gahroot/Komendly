import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseViewBeacon, recordGiftView } from "@/lib/ads/gifts";
import { startGiftEncore, startOnClickRun } from "@/lib/kly/encore";
import { recordHumanClick } from "@/lib/ads/outbound/server";
import { clientIpFromHeaders, isMetaIp } from "@/lib/ads/meta-ip";

/**
 * Public view beacon from /gift/<token> (the page itself is cached, so views are counted here). Skips bots and the sender.
 * The page fires it only after a real interaction (or 5 s visible + focused), sending {interacted:true}: only those views
 * are a person (`human`), so only they count as the lead's click, start an on-click drawing or an encore. Anything else
 * (an old cached page, a direct POST) is still counted as a view for the dashboards, as before, but is not a click.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { human, signal } = parseViewBeacon(await request.json().catch(() => null));
  const viewer = await getCurrentUser().catch(() => null);
  const counted = await recordGiftView(token, {
    ua: request.headers.get("user-agent"),
    isMetaIp: isMetaIp(clientIpFromHeaders(request.headers)),
    viewerUserId: viewer?.id ?? null,
    human,
    signal,
  }).catch(() => false);
  const person = counted && human;
  // Outbound gifts: a real person is looking (they interacted, so not a link scanner), so Ozzy draws 2 more ads live.
  if (person) await recordHumanClick(token).catch((e: unknown) => console.error("[kly] click record failed", e));
  // On-click gifts: the first real view starts the drawing; otherwise the 2-ad encore on top of the hook ad.
  const drawn = person ? await startOnClickRun(token).catch((e: unknown) => (console.error("[kly] on-click run failed", e), null)) : null;
  const encore = person && !drawn ? await startGiftEncore(token).catch((e: unknown) => (console.error("[kly] encore failed", e), null)) : null;
  return NextResponse.json({ counted, human, drawing: Boolean(drawn), encore: Boolean(encore) }, { headers: { "Cache-Control": "no-store" } });
}

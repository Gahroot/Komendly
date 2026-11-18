// "Made with Komendly" mark short link (komendly.com/m/<code>, printed on free/trial ads by the engine).
// Redirects to the free-ads landing with viral_branding attribution (utm_source=made_with); records branded_share_visit.
import { NextResponse } from "next/server";
import { trackAdsEvent } from "@/lib/ads/events";
import { prisma } from "@/lib/prisma";
import { systemEnabled } from "@/lib/growth/systems";
import { isExternalReferrer, isMarkCode, MADE_WITH_LANDING, markRedirectUrl, VIRAL_KEY } from "@/lib/growth/viral-branding";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toLowerCase();
  if (!isMarkCode(code)) return NextResponse.redirect(MADE_WITH_LANDING, 302);
  // Kill switch off: still a working link (printed images live on), just no tracking.
  if (!(await systemEnabled(prisma, VIRAL_KEY))) return NextResponse.redirect(MADE_WITH_LANDING, 302);
  const referrer = request.headers.get("referer");
  if (isExternalReferrer(referrer)) await trackAdsEvent("branded_share_visit", { props: { system: VIRAL_KEY, surface: "mark", code, referrer: referrer?.slice(0, 200) ?? null } });
  const res = NextResponse.redirect(markRedirectUrl(code), 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

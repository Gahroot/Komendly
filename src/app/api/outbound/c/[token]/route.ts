import { NextRequest, NextResponse } from "next/server";
import { claimRedirect } from "@/lib/ads/outbound/server";
import { KLY_COOKIE, klyCookieOptions } from "@/lib/kly/claim";

/** Cold-email claim link: counts the click, sets kmd_kly (signup attribution), then the gift page with utm_source=outbound (middleware writes kmd_ft). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dest = await claimRedirect(token, request.headers.get("user-agent")).catch(() => null);
  const res = NextResponse.redirect(new URL(dest?.path ?? "/free-ads?utm_source=outbound&utm_medium=email", request.url), 307);
  if (dest) res.cookies.set(KLY_COOKIE, dest.claimToken, klyCookieOptions);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

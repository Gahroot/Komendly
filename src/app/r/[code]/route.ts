import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { giftByToken, isBotUserAgent } from "@/lib/ads/gifts";
import { isMetaIp, clientIpFromHeaders } from "@/lib/ads/meta-ip";
import { GIFT_COOKIE, REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, isReferralCode } from "@/lib/ads/referrals";
import { startHref } from "@/lib/ads/url-submit";

/**
 * Share link: /r/<code> (optionally ?gift=<token> from a gift page). Remembers the referrer in kmd_ref (60 days) and
 * redirects with utm_source=referral so the middleware writes the kmd_ft first touch like any other campaign.
 * Gift recipients go straight to sign-up with their own site prefilled; everyone else sees the referral landing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toLowerCase();
  const owner = isReferralCode(code) ? await prisma.adsReferralCode.findUnique({ where: { code }, select: { workspaceId: true } }) : null;
  const base = request.nextUrl.clone();
  base.search = "";
  if (!owner) {
    base.pathname = "/free-ads";
    return NextResponse.redirect(base, 307);
  }
  const giftToken = request.nextUrl.searchParams.get("gift");
  const gift = giftToken ? await giftByToken(giftToken) : null;
  const validGift = gift && gift.senderWorkspaceId === owner.workspaceId ? gift : null;

  const utm = new URLSearchParams({ utm_source: "referral", utm_medium: validGift ? "gift" : "referral", utm_campaign: code });
  let dest: string;
  if (validGift) {
    const signup = startHref(validGift.recipientUrl, "auto", false);
    dest = `${signup}&ref=${encodeURIComponent(code)}&${utm.toString()}`;
  } else {
    dest = `/free-ads/from/${encodeURIComponent(code)}?${utm.toString()}`;
  }
  const res = NextResponse.redirect(new URL(dest, base), 307);
  const opts = { path: "/", maxAge: REFERRAL_COOKIE_MAX_AGE, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", httpOnly: true };
  res.cookies.set(REFERRAL_COOKIE, code, opts);
  if (validGift) res.cookies.set(GIFT_COOKIE, validGift.id, opts);
  res.headers.set("Cache-Control", "private, no-store");
  const ua = request.headers.get("user-agent");
  if (!isBotUserAgent(ua) && !isMetaIp(clientIpFromHeaders(request.headers))) {
    await trackAdsEvent("referral_landed", { workspaceId: owner.workspaceId, props: { code, ...(validGift ? { giftId: validGift.id } : {}) } });
  }
  return res;
}

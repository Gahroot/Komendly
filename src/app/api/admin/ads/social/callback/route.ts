// Admin-only Meta redirect target for "Connect Komendly Page". Opened in the admin's own browser (session cookie
// present), so it is not a public prefix in middleware.
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { SOCIAL_STATE_COOKIE, finishSocialConnect } from "@/lib/kly/social-connect";

function back(request: NextRequest, status: string) {
  const res = NextResponse.redirect(new URL(`/admin/ads/outbound?social=${encodeURIComponent(status)}`, request.url));
  res.cookies.delete({ name: SOCIAL_STATE_COOKIE, path: "/api/admin/ads/social" });
  return res;
}

export async function GET(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return back(request, "cancelled");
  try {
    const r = await finishSocialConnect({ cookie: request.cookies.get(SOCIAL_STATE_COOKIE)?.value, state, code, userId: admin.user.id });
    return back(request, r.ok ? "connected" : r.error);
  } catch (e) {
    console.error("[admin/ads/social] callback failed", e);
    return back(request, "Meta sign-in failed. Please try again.");
  }
}

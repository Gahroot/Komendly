// Admin-only: start "Connect Komendly Page" (Facebook Login with Page + Instagram publishing scopes).
import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { SOCIAL_STATE_COOKIE, startSocialConnect } from "@/lib/kly/social-connect";

export async function GET() {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  try {
    const { url, cookie } = startSocialConnect(admin.user.id);
    const res = NextResponse.redirect(url);
    res.cookies.set(SOCIAL_STATE_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/ads/social", maxAge: 600 });
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Meta isn't configured" }, { status: 503 });
  }
}

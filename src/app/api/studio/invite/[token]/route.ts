import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlausibleInviteToken, STUDIO_INVITE_COOKIE, STUDIO_INVITE_COOKIE_MAX_AGE } from "@/lib/studio/invite";

type Ctx = { params: Promise<{ token: string }> };

/** Public: accept an invite -> remember it in a cookie (claimed at sign-up) and go to sign-up (or Studio if signed in). */
export async function GET(request: NextRequest, { params }: Ctx) {
  const token = (await params).token;
  const base = request.nextUrl.clone();
  base.search = "";
  if (await getCurrentUser()) {
    base.pathname = "/studio";
    return NextResponse.redirect(base, 303);
  }
  base.pathname = "/ads/signup";
  base.searchParams.set("next", "/studio");
  const res = NextResponse.redirect(base, 303);
  if (isPlausibleInviteToken(token) && (await prisma.studioInvite.findUnique({ where: { token }, select: { status: true } }))?.status === "sent") {
    res.cookies.set(STUDIO_INVITE_COOKIE, token, { path: "/", maxAge: STUDIO_INVITE_COOKIE_MAX_AGE, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  }
  return res;
}

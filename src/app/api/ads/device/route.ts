import { NextRequest, NextResponse } from "next/server";
import { DEVICE_COOKIE } from "@/lib/ads/run";

/** Sets the first-party device cookie used for trial fingerprinting (called from /ads). */
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  if (!request.cookies.get(DEVICE_COOKIE)) {
    response.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

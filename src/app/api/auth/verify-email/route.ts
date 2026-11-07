import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ads/abuse";
import { sendVerificationEmail } from "@/lib/ads/verify";

/** Resend the verification email to the signed-in user. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
  if (!(await rateLimit(`verify-email:${user.id}`, 5, 3600))) {
    return NextResponse.json({ error: "We've sent a few emails already. Check your spam folder or try again later." }, { status: 429 });
  }
  await sendVerificationEmail(user, request.nextUrl.origin);
  return NextResponse.json({ ok: true });
}

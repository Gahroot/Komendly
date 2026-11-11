import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ads/abuse";
import { sendVerificationEmail } from "@/lib/ads/verify";

/** Which address the code went to (for the "check your inbox" screen). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  return NextResponse.json({ email: user.email, verified: Boolean(user.emailVerifiedAt) });
}

/** Resend the verification email (new code + link) to the signed-in user. 1/min, 5/hour. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
  if (!(await rateLimit(`verify-email-min:${user.id}`, 1, 60))) {
    return NextResponse.json({ error: "Just sent one. Wait a minute before asking for another." }, { status: 429 });
  }
  if (!(await rateLimit(`verify-email:${user.id}`, 5, 3600))) {
    return NextResponse.json({ error: "We've sent a few emails already. Check your spam folder or try again later." }, { status: 429 });
  }
  await sendVerificationEmail(user, request.nextUrl.origin);
  return NextResponse.json({ ok: true });
}

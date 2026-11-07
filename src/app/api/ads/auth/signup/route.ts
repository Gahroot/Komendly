import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, createUser, getUserByEmail, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/ads/abuse";
import { fingerprintFrom } from "@/lib/ads/run";
import { sendVerificationEmail } from "@/lib/ads/verify";
import { FIRST_TOUCH_COOKIE, parseFirstTouch } from "@/lib/analytics/first-touch";
import { trackAdsEvent } from "@/lib/ads/events";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace } from "@/lib/ads/workspace";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

const SIGNUPS_PER_HOUR_PER_IP = 5;

/** /ads sign-up: no payment needed (free trial); signs in and sends the verification email. */
export async function POST(request: NextRequest) {
  try {
    // Burst guard against scripted account creation (trial farming): per client IP.
    const ip = fingerprintFrom(request).ip ?? "unknown";
    if (!(await rateLimit(`ads-signup:${ip}`, SIGNUPS_PER_HOUR_PER_IP, 3600))) {
      throw new AdsHttpError(429, "rate_limited", "Too many sign-ups from this network. Try again later.");
    }
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Enter your name, a valid email and a password of at least 8 characters.");
    if (await getUserByEmail(parsed.data.email)) throw new AdsHttpError(409, "email_taken", "An account with this email already exists. Sign in instead.");
    const user = await createUser(parsed.data);
    const workspace = await getOrCreateWorkspace(user);
    // Attribution: which blog post / campaign first brought this user (set by middleware from UTM params).
    const firstTouch = parseFirstTouch(request.cookies.get(FIRST_TOUCH_COOKIE)?.value);
    await trackAdsEvent("signed_up", { workspaceId: workspace.id, userId: user.id, props: { firstTouch } });
    await setSessionCookie(await createSession(user.id));
    await sendVerificationEmail(user, request.nextUrl.origin).catch((error) => console.error("[ads] verification email failed", error));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

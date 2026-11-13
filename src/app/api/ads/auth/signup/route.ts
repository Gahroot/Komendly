import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSession, createUser, getUserByEmail, setSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/ads/abuse";
import { fingerprintFrom } from "@/lib/ads/run";
import { sendVerificationEmail } from "@/lib/ads/verify";
import { FIRST_TOUCH_COOKIE, parseFirstTouch } from "@/lib/analytics/first-touch";
import { trackAdsEvent } from "@/lib/ads/events";
import { GIFT_COOKIE, REFERRAL_COOKIE, recordReferralAtSignup } from "@/lib/ads/referrals";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace } from "@/lib/ads/workspace";
import { STUDIO_INVITE_COOKIE } from "@/lib/studio/invite";
import { claimStudioInviteAtSignup } from "@/lib/studio/invite-server";
import { KLY_COOKIE, sameInbox } from "@/lib/kly/claim";
import { prisma } from "@/lib/prisma";
import { linkKlyLeadAtSignup } from "@/lib/kly/attribution";
import { claimOutboundGift } from "@/lib/kly/gift-claim";
import { ANON_ID_COOKIE, EXP_COOKIE, parseAssignments } from "@/lib/analytics/experiments";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
  /** Referral code from the landing URL (?ref=), used when the kmd_ref cookie is missing. */
  ref: z.string().max(40).optional(),
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
    const user = await createUser({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password });
    const workspace = await getOrCreateWorkspace(user);
    // Attribution: which blog post / campaign first brought this user (set by middleware from UTM params).
    const firstTouch = parseFirstTouch(request.cookies.get(FIRST_TOUCH_COOKIE)?.value);
    // Kly (cold outbound): link the lead whose claim link set kmd_kly. Never throws.
    const klyLead = await linkKlyLeadAtSignup(request.cookies.get(KLY_COOKIE)?.value, { userId: user.id, workspaceId: workspace.id });
    // Their gifted ad is waiting in the new account (claims the outbound gift, copies the ad). Never throws.
    if (klyLead) await claimOutboundGift(workspace.id, user.id, "signed_up");
    // Same inbox we emailed (they clicked our link from it): already proven, so skip the confirmation step.
    const preVerified = klyLead ? await prisma.outboundLead.findUnique({ where: { id: klyLead }, select: { email: true } }).then((l) => sameInbox(l?.email, user.email)).catch(() => false) : false;
    if (preVerified) await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    await trackAdsEvent("signed_up", { workspaceId: workspace.id, userId: user.id, props: { firstTouch, ...(klyLead ? { klyLead } : {}), anonId: request.cookies.get(ANON_ID_COOKIE)?.value, exp: parseAssignments(request.cookies.get(EXP_COOKIE)?.value) } });
    await recordReferralAtSignup({
      code: request.cookies.get(REFERRAL_COOKIE)?.value ?? parsed.data.ref,
      giftId: request.cookies.get(GIFT_COOKIE)?.value ?? null,
      user,
      workspace,
      fp: fingerprintFrom(request),
    });
    // Ozzy Studio invite (/studio/invite/<token>): the friend gets 2 free videos. Never fails sign-up.
    const studioInvite = request.cookies.get(STUDIO_INVITE_COOKIE)?.value;
    if (studioInvite) await claimStudioInviteAtSignup({ token: studioInvite, user, workspace, fp: fingerprintFrom(request), friendIsNew: true });
    await setSessionCookie(await createSession(user.id));
    if (!preVerified) await sendVerificationEmail(user, request.nextUrl.origin).catch((error) => console.error("[ads] verification email failed", error));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

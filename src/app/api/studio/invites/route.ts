import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isDisposableEmail, normalizeEmail, rateLimit } from "@/lib/ads/abuse";
import { fingerprintFrom } from "@/lib/ads/run";
import { appBaseUrl } from "@/lib/ads/mailer";
import { AdsHttpError, adsErrorResponse } from "@/lib/ads/workspace";
import { STUDIO_INVITE } from "@/lib/studio/contracts";
import { inviteLink, utcMonthStart } from "@/lib/studio/invite";
import { createStudioInvite } from "@/lib/studio/invite-server";
import { studioAccess } from "@/lib/studio/server";
import { trackAdsEvent } from "@/lib/ads/events";

const Body = z.object({ email: z.string().trim().email().max(254).optional().or(z.literal("")) });

/** "Give a friend 2 free videos": create an invite link (optionally emailed by Ozzy). */
export async function POST(request: NextRequest) {
  try {
    const { user, workspace } = await studioAccess();
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Enter a valid email, or leave it empty for a link.");
    const email = parsed.data.email || undefined;
    if (email && normalizeEmail(email) === normalizeEmail(user.email)) throw new AdsHttpError(400, "self", "That's you! Invite a friend instead.");
    if (email && isDisposableEmail(email)) throw new AdsHttpError(400, "disposable_email", "Use your friend's real email address.");
    if (!(await rateLimit(`studio-invites:${user.id}`, email ? 10 : 30, 24 * 3600))) throw new AdsHttpError(429, "rate_limited", "That's plenty of invites for today.");
    const invite = await createStudioInvite({ user, workspace, email, fp: fingerprintFrom(request), origin: request.nextUrl.origin });
    await trackAdsEvent("studio_invite_sent", { workspaceId: workspace.id, userId: user.id, props: { inviteId: invite.id, emailed: invite.emailed } });
    return NextResponse.json({ link: invite.link, token: invite.token, emailed: invite.emailed }, { status: 201 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { workspace } = await studioAccess();
    const invites = await prisma.studioInvite.findMany({ where: { senderWorkspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 50 });
    const rewardedThisMonth = invites.filter((i) => i.rewardedAt && i.rewardedAt >= utcMonthStart(new Date())).length;
    const base = appBaseUrl(request.nextUrl.origin);
    return NextResponse.json({
      invites: invites.map((i) => ({ id: i.id, link: inviteLink(base, i.token), email: i.email, status: i.status, createdAt: i.createdAt.toISOString() })),
      rewardedThisMonth,
      maxRewardsPerMonth: STUDIO_INVITE.maxRewardsPerMonth,
    });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

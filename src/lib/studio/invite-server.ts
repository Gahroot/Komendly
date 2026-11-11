// Ozzy Studio invites: DB side (create, claim at sign-up, reward on friend email verification). Idempotent.
import { randomBytes } from "node:crypto";
import type { AdsWorkspace, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashIdentity, ipPrefix, normalizeEmail, type RequestFingerprint } from "@/lib/ads/abuse";
import { appBaseUrl, sendAdsMail } from "@/lib/ads/mailer";
import { renderEmailLayout } from "@/lib/email/layout";
import { trackAdsEvent } from "@/lib/ads/events";
import { STUDIO_INVITE } from "./contracts";
import { decideInviteClaim, decideSenderReward, inviteLink, isPlausibleInviteToken, utcMonthStart } from "./invite";

const NETWORK_EVENT = "studio_invite_created";

export function networkHash(fp: RequestFingerprint): string | null {
  const prefix = fp.ip ? ipPrefix(fp.ip) : null;
  if (!prefix) return null;
  try {
    return hashIdentity("ip", prefix);
  } catch {
    return null;
  }
}

export async function createStudioInvite(input: { user: User; workspace: AdsWorkspace; email?: string; fp: RequestFingerprint; origin: string }) {
  const token = randomBytes(16).toString("base64url");
  const invite = await prisma.studioInvite.create({
    data: { token, senderWorkspaceId: input.workspace.id, senderUserId: input.user.id, email: input.email ?? null },
  });
  // The sender's network (hashed) for the same-network check at claim time.
  await prisma.adsEvent.create({
    data: { name: NETWORK_EVENT, workspaceId: input.workspace.id, userId: input.user.id, props: { inviteId: invite.id, network: networkHash(input.fp) } },
  });
  const base = appBaseUrl(input.origin);
  const link = inviteLink(base, token);
  let emailed = false;
  if (input.email) {
    const from = input.user.name?.split(" ")[0] || "A friend";
    const text = `G'day!\n\n${from} reckons you'd like Ozzy Studio, so they've sent you ${STUDIO_INVITE.friendFreeVideos} free videos.\n\nTell me what you want (a promo, a launch video, your own footage cut into an ad) and I'll make it while we chat. No card needed.\n\nClaim them here: ${link}\n\nOzzy\n(the dingo wizard at Komendly)`;
    await sendAdsMail({
      to: input.email,
      subject: `${from} sent you ${STUDIO_INVITE.friendFreeVideos} free videos from Ozzy`,
      text,
      html: renderEmailLayout({
        appUrl: base,
        preheader: `${STUDIO_INVITE.friendFreeVideos} free Ozzy Studio videos, no card needed.`,
        heading: `${from} sent you ${STUDIO_INVITE.friendFreeVideos} free videos`,
        paragraphs: [
          "G'day! I'm Ozzy. Tell me what you want, a promo, a launch video or your own footage cut into an ad, and I'll make it while we chat.",
          "No card needed. The videos are yours to keep.",
        ],
        button: { label: "Claim my free videos", href: link },
      }),
    }).then(() => (emailed = true), (error) => console.error("[studio] invite email failed", error));
  }
  return { id: invite.id, token, link, emailed };
}

export type ClaimOutcome = { claimed: true; freeVideos: number } | { claimed: false; reason: string };

/** Called right after a NEW user signs up with the invite cookie. Never throws (sign-up must not fail). */
export async function claimStudioInviteAtSignup(input: { token: string | undefined | null; user: User; workspace: AdsWorkspace; fp: RequestFingerprint; friendIsNew: boolean }): Promise<ClaimOutcome> {
  try {
    if (!input.token || !isPlausibleInviteToken(input.token)) return { claimed: false, reason: "no_invite" };
    const invite = await prisma.studioInvite.findUnique({ where: { token: input.token } });
    if (!invite) return { claimed: false, reason: "unknown" };
    const sender = await prisma.user.findUnique({ where: { id: invite.senderUserId }, select: { email: true } });
    const netEvent = await prisma.adsEvent.findFirst({ where: { name: NETWORK_EVENT, workspaceId: invite.senderWorkspaceId, props: { path: ["inviteId"], equals: invite.id } } });
    const senderNetwork = netEvent?.props && typeof netEvent.props === "object" && !Array.isArray(netEvent.props) ? ((netEvent.props as Record<string, unknown>).network as string | null) ?? null : null;
    const decision = decideInviteClaim({
      inviteStatus: invite.status,
      senderUserId: invite.senderUserId,
      senderWorkspaceId: invite.senderWorkspaceId,
      senderEmail: sender ? normalizeEmail(sender.email) : "",
      senderNetwork,
      friendUserId: input.user.id,
      friendWorkspaceId: input.workspace.id,
      friendEmail: normalizeEmail(input.user.email),
      friendNetwork: networkHash(input.fp),
      friendIsNew: input.friendIsNew,
      friendFreeVideos: input.workspace.studioFreeVideos,
    });
    if (!decision.ok) {
      if (decision.reason !== "already_claimed") {
        await prisma.studioInvite.updateMany({ where: { id: invite.id, status: "sent" }, data: { status: "rejected", rejectReason: decision.reason, claimedUserId: input.user.id } });
      }
      return { claimed: false, reason: decision.reason };
    }
    const out = await prisma.$transaction(async (tx) => {
      // Conditional update = the idempotency guard (claimedWorkspaceId is unique too).
      const won = await tx.studioInvite.updateMany({
        where: { id: invite.id, status: "sent" },
        data: { status: "claimed", claimedWorkspaceId: input.workspace.id, claimedUserId: input.user.id, claimedAt: new Date() },
      });
      if (won.count !== 1) return { claimed: false, reason: "already_claimed" } as const;
      await tx.adsWorkspace.update({ where: { id: input.workspace.id }, data: { studioFreeVideos: decision.friendFreeVideos } });
      return { claimed: true, freeVideos: decision.friendFreeVideos } as const;
    });
    if (out.claimed) await trackAdsEvent("studio_invite_claimed", { workspaceId: input.workspace.id, userId: input.user.id, props: { inviteId: invite.id, senderWorkspaceId: invite.senderWorkspaceId } });
    return out;
  } catch (error) {
    console.error("[studio] invite claim failed", error);
    return { claimed: false, reason: "error" };
  }
}

/** Called when a user verifies their email: rewards the sender of the invite they claimed (+1 video, capped per month). */
export async function rewardStudioInviteSender(friendUserId: string, now: Date = new Date()): Promise<boolean> {
  try {
    const invite = await prisma.studioInvite.findFirst({ where: { claimedUserId: friendUserId, status: "claimed" } });
    if (!invite) return false;
    const rewarded = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`studio-invite-reward:${invite.senderWorkspaceId}`}))`;
      const rewardsThisMonth = await tx.studioInvite.count({ where: { senderWorkspaceId: invite.senderWorkspaceId, status: "rewarded", rewardedAt: { gte: utcMonthStart(now) } } });
      const fresh = await tx.studioInvite.findUnique({ where: { id: invite.id }, select: { status: true } });
      const d = decideSenderReward({ inviteStatus: fresh?.status ?? "", rewardsThisMonth });
      if (!d.reward) return false;
      const won = await tx.studioInvite.updateMany({ where: { id: invite.id, status: "claimed" }, data: { status: "rewarded", rewardedAt: now } });
      if (won.count !== 1) return false;
      await tx.adsWorkspace.update({ where: { id: invite.senderWorkspaceId }, data: { studioFreeVideos: { increment: d.videos } } });
      return true;
    });
    if (rewarded) await trackAdsEvent("studio_invite_rewarded", { workspaceId: invite.senderWorkspaceId, userId: invite.senderUserId, props: { inviteId: invite.id, friendUserId } });
    return rewarded;
  } catch (error) {
    console.error("[studio] invite reward failed", error);
    return false;
  }
}

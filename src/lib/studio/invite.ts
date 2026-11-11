// Ozzy Studio invites ("give a friend 2 free videos"): pure decisions. DB side lives in invite-server.ts.
import { STUDIO_INVITE } from "./contracts";

/** Cookie set by /api/studio/invite/<token>; read once at sign-up. */
export const STUDIO_INVITE_COOKIE = "kmd_si";
export const STUDIO_INVITE_COOKIE_MAX_AGE = 30 * 24 * 3600;

export type InviteRejectReason = "self" | "same_network" | "existing_user" | "already_claimed";
export type InviteClaimDecision = { ok: true; friendFreeVideos: number } | { ok: false; reason: InviteRejectReason };

export interface InviteClaimInput {
  inviteStatus: string;
  senderUserId: string;
  senderWorkspaceId: string;
  /** Normalized (abuse.normalizeEmail) sender email. */
  senderEmail: string;
  /** Hashed network prefix of the sender when the invite was made (null = unknown). */
  senderNetwork: string | null;
  friendUserId: string;
  friendWorkspaceId: string;
  friendEmail: string;
  friendNetwork: string | null;
  /** The friend account was created in this same sign-up request. */
  friendIsNew: boolean;
  /** The friend's current studioFreeVideos. */
  friendFreeVideos: number;
}

/** Pure: may this sign-up claim the invite, and how many free videos does the friend end with. */
export function decideInviteClaim(i: InviteClaimInput): InviteClaimDecision {
  if (i.inviteStatus !== "sent") return { ok: false, reason: "already_claimed" };
  if (!i.friendIsNew) return { ok: false, reason: "existing_user" };
  if (i.friendUserId === i.senderUserId || i.friendWorkspaceId === i.senderWorkspaceId || i.friendEmail === i.senderEmail) {
    return { ok: false, reason: "self" };
  }
  if (i.senderNetwork && i.friendNetwork && i.senderNetwork === i.friendNetwork) return { ok: false, reason: "same_network" };
  return { ok: true, friendFreeVideos: Math.max(STUDIO_INVITE.friendFreeVideos, i.friendFreeVideos) };
}

export type SenderRewardDecision = { reward: true; videos: number } | { reward: false; reason: "not_claimed" | "monthly_cap" };

/** Pure: does the sender earn their +1 video now that the friend verified their email. */
export function decideSenderReward(i: { inviteStatus: string; rewardsThisMonth: number }): SenderRewardDecision {
  if (i.inviteStatus !== "claimed") return { reward: false, reason: "not_claimed" };
  if (i.rewardsThisMonth >= STUDIO_INVITE.maxRewardsPerMonth) return { reward: false, reason: "monthly_cap" };
  return { reward: true, videos: STUDIO_INVITE.senderRewardVideos };
}

/** First instant of the UTC month containing `now` (the reward cap window). */
export function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Tokens are URL-safe, 16+ chars; anything else is never looked up. */
export function isPlausibleInviteToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

export function inviteLink(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/studio/invite/${token}`;
}

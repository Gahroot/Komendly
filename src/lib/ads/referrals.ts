// Give 10, get 10: referral codes, sign-up attribution, self-referral rules, the referred trial size and the
// free Starter month after 3 rewarded friends. The engine marks referrals trial_done/rewarded and grants the
// 10 expiring credits (CreditLedger reason referral_reward, expiresAt); the web only records sign-ups.
import { Prisma, type AdsWorkspace, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claimOutboundGift } from "@/lib/kly/gift-claim";
import { hashIdentity, ipPrefix, normalizeEmail, type RequestFingerprint } from "./abuse";
import { isPaidWorkspace } from "./billing-gates";
import { trackAdsEvent } from "./events";

export const REFERRAL_COOKIE = "kmd_ref";
/** AdsGift.id of the gift that brought a visitor (set with kmd_ref by /r/<code>?gift=<token>). */
export const GIFT_COOKIE = "kmd_gift";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;
/** Trial statics for a referred workspace (normal trial: 10). */
export const REFERRED_TRIAL_STATIC = 20;
export const REFERRER_REWARD_CREDITS = 10;
export const REWARD_EXPIRY_DAYS = 30;
export const MONTHLY_REWARD_CAP = 5;
export const FREE_MONTH_AFTER = 3;
export const FREE_MONTH_TRIAL_DAYS = 30;
export { isReferralCode, makeReferralCode, SHARE_ORIGIN, shareUrl } from "./referral-code";
import { isReferralCode, makeReferralCode, shareUrl } from "./referral-code";

export function firstName(name: string | null | undefined): string {
  const f = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return f ? f.charAt(0).toUpperCase() + f.slice(1, 30) : "A friend";
}

const WEBMAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com",
  "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "web.de", "mail.com", "zoho.com", "yandex.com",
  "hey.com", "fastmail.com", "qq.com", "163.com", "orange.fr", "free.fr", "hotmail.co.uk", "yahoo.co.uk", "btinternet.com", "comcast.net",
]);

export function isWebmailDomain(domain: string): boolean {
  return WEBMAIL.has(domain.toLowerCase());
}

export interface ReferralParty {
  workspaceId: string;
  userId: string;
  email: string;
  /** hashIdentity("ip", /24|/64) values seen for this party. */
  ipHashes: string[];
  deviceHashes: string[];
}

export type ReferralDecision = { ok: true } | { ok: false; reason: "self_referral" | "same_email_domain" | "same_device" | "same_network" };

/** Pure self-referral rules. */
export function decideReferral(referrer: ReferralParty, referred: ReferralParty): ReferralDecision {
  if (referrer.workspaceId === referred.workspaceId || referrer.userId === referred.userId) return { ok: false, reason: "self_referral" };
  if (normalizeEmail(referrer.email) === normalizeEmail(referred.email)) return { ok: false, reason: "self_referral" };
  const d1 = normalizeEmail(referrer.email).split("@")[1] ?? "";
  const d2 = normalizeEmail(referred.email).split("@")[1] ?? "";
  if (d1 && d1 === d2 && !isWebmailDomain(d1)) return { ok: false, reason: "same_email_domain" };
  if (referred.deviceHashes.some((h) => referrer.deviceHashes.includes(h))) return { ok: false, reason: "same_device" };
  if (referred.ipHashes.some((h) => referrer.ipHashes.includes(h))) return { ok: false, reason: "same_network" };
  return { ok: true };
}

/** Pure: trial statics for a workspace, given whether it has a non-rejected referral. */
export function trialStaticFor(base: number, referred: boolean): number {
  return referred ? Math.max(base, REFERRED_TRIAL_STATIC) : base;
}

export function fpHashes(fp: RequestFingerprint): { ipHashes: string[]; deviceHashes: string[] } {
  const prefix = fp.ip ? ipPrefix(fp.ip) : null;
  return { ipHashes: prefix ? [hashIdentity("ip", prefix)] : [], deviceHashes: fp.deviceId ? [hashIdentity("device", fp.deviceId)] : [] };
}

// ---------------------------------------------------------------------------
// DB

export async function ensureReferralCode(workspace: Pick<AdsWorkspace, "id">, user: Pick<User, "id" | "name">): Promise<string> {
  const existing = await prisma.adsReferralCode.findUnique({ where: { workspaceId: workspace.id } });
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const row = await prisma.adsReferralCode.create({ data: { code: makeReferralCode(user.name), workspaceId: workspace.id, userId: user.id } });
      return row.code;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const again = await prisma.adsReferralCode.findUnique({ where: { workspaceId: workspace.id } });
      if (again) return again.code;
    }
  }
  throw new Error("Could not allocate a referral code");
}

/** Code + the referrer's display name, or null for unknown codes. */
export async function lookupReferralCode(code: string): Promise<{ code: string; workspaceId: string; userId: string; name: string } | null> {
  if (!isReferralCode(code)) return null;
  const row = await prisma.adsReferralCode.findUnique({ where: { code } });
  if (!row) return null;
  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true } });
  return { code: row.code, workspaceId: row.workspaceId, userId: row.userId, name: firstName(user?.name) };
}

async function referrerParty(workspaceId: string, userId: string): Promise<ReferralParty | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return null;
  const claims = await prisma.adsTrialClaim.findMany({ where: { workspaceId }, select: { ipHash: true, deviceHash: true } });
  return {
    workspaceId,
    userId,
    email: user.email,
    ipHashes: claims.flatMap((c) => (c.ipHash ? [c.ipHash] : [])),
    deviceHashes: claims.flatMap((c) => (c.deviceHash ? [c.deviceHash] : [])),
  };
}

/** At ads sign-up: record the referral (or a rejected audit row). Never throws. */
export async function recordReferralAtSignup(input: { code: string | null | undefined; giftId?: string | null; user: User; workspace: AdsWorkspace; fp: RequestFingerprint }): Promise<void> {
  try {
    if (!isReferralCode(input.code)) return;
    const owner = await prisma.adsReferralCode.findUnique({ where: { code: input.code } });
    if (!owner) return;
    const referrer = await referrerParty(owner.workspaceId, owner.userId);
    if (!referrer) return;
    const decision = decideReferral(referrer, { workspaceId: input.workspace.id, userId: input.user.id, email: input.user.email, ...fpHashes(input.fp) });
    const gift = input.giftId ? await prisma.adsGift.findFirst({ where: { id: input.giftId, senderWorkspaceId: owner.workspaceId }, select: { id: true } }) : null;
    const source = gift ? "gift" : owner.kind === "partner" ? "partner" : "link";
    await prisma.adsReferral.create({
      data: {
        code: owner.code,
        referrerWorkspaceId: owner.workspaceId,
        referredWorkspaceId: input.workspace.id,
        referredUserId: input.user.id,
        source,
        giftId: gift?.id ?? null,
        status: decision.ok ? "signed_up" : "rejected",
        rejectReason: decision.ok ? null : decision.reason,
      },
    });
    if (decision.ok) {
      await trackAdsEvent("referral_signed_up", { workspaceId: input.workspace.id, userId: input.user.id, props: { code: owner.code, source, referrerWorkspaceId: owner.workspaceId } });
      if (gift) await trackAdsEvent("gift_claimed", { workspaceId: input.workspace.id, userId: input.user.id, props: { giftId: gift.id, stage: "signed_up" } });
    }
  } catch (error) {
    console.error("[ads] referral at signup failed", error);
  }
}

export async function hasActiveReferral(workspaceId: string): Promise<boolean> {
  const r = await prisma.adsReferral.findUnique({ where: { referredWorkspaceId: workspaceId }, select: { status: true } });
  return !!r && r.status !== "rejected";
}

/** Trial size at run start: 20 statics for referred workspaces. */
export async function trialStaticCountFor(workspaceId: string, base: number): Promise<number> {
  return trialStaticFor(base, await hasActiveReferral(workspaceId));
}

/** When a referred (gift) or Kly outbound workspace starts its trial: mark the gift claimed. Never throws. */
export async function markGiftClaimed(workspaceId: string, userId: string): Promise<void> {
  try {
    const r = await prisma.adsReferral.findUnique({ where: { referredWorkspaceId: workspaceId }, select: { giftId: true, status: true } });
    if (!r) {
      // Kly outbound gift: the lead was linked to this workspace at signup (kmd_kly cookie).
      await claimOutboundGift(workspaceId, userId, "trial_started");
      return;
    }
    if (!r.giftId || r.status === "rejected") return;
    const res = await prisma.adsGift.updateMany({ where: { id: r.giftId, claimedAt: null }, data: { claimedAt: new Date(), claimedWorkspaceId: workspaceId } });
    if (res.count > 0) await trackAdsEvent("gift_claimed", { workspaceId, userId, props: { giftId: r.giftId, stage: "trial_started" } });
  } catch (error) {
    console.error("[ads] gift claim failed", error);
  }
}

// ---------------------------------------------------------------------------
// /ads/refer

export interface ReferralFriendView {
  id: string;
  name: string;
  status: "signed_up" | "trial_done" | "rewarded";
  createdAt: string;
}
export interface ReferralCreditView {
  credits: number;
  earnedAt: string;
  expiresAt: string;
  expired: boolean;
}
export interface ReferralSummary {
  code: string;
  shareUrl: string;
  friends: ReferralFriendView[];
  rewardedCount: number;
  credits: ReferralCreditView[];
  freeMonth: FreeMonthState;
}
export type FreeMonthState = "locked" | "available" | "claimed" | "subscribed";

/** Pure: is the free Starter month claimable? */
export function freeMonthState(input: { rewardedCount: number; isPaid: boolean; claimed: boolean }): FreeMonthState {
  if (input.claimed) return "claimed";
  if (input.isPaid) return "subscribed";
  return input.rewardedCount >= FREE_MONTH_AFTER ? "available" : "locked";
}

/** Initial for privacy: "Sam K." */
export function friendLabel(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "A friend";
  const last = parts.length > 1 ? ` ${(parts[parts.length - 1] ?? "").charAt(0).toUpperCase()}.` : "";
  return `${first.charAt(0).toUpperCase()}${first.slice(1, 20)}${last}`;
}

export async function freeMonthClaimed(workspaceId: string): Promise<boolean> {
  return !!(await prisma.adsEvent.findFirst({ where: { name: "referral_free_month_claimed", workspaceId }, select: { id: true } }));
}

export async function referralSummary(user: User, workspace: AdsWorkspace, now: Date = new Date()): Promise<ReferralSummary> {
  const code = await ensureReferralCode(workspace, user);
  const [rows, grants, claimed] = await Promise.all([
    prisma.adsReferral.findMany({ where: { referrerWorkspaceId: workspace.id, status: { not: "rejected" } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.creditLedger.findMany({ where: { workspaceId: workspace.id, reason: "referral_reward" }, orderBy: { createdAt: "desc" }, take: 50 }),
    freeMonthClaimed(workspace.id),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.referredUserId) } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  const friends: ReferralFriendView[] = rows.map((r) => ({
    id: r.id,
    name: friendLabel(names.get(r.referredUserId)),
    status: r.status === "rewarded" || r.status === "paid" ? "rewarded" : r.status === "trial_done" ? "trial_done" : "signed_up",
    createdAt: r.createdAt.toISOString(),
  }));
  const rewardedCount = friends.filter((f) => f.status === "rewarded").length;
  return {
    code,
    shareUrl: shareUrl(code),
    friends,
    rewardedCount,
    credits: grants.map((g) => {
      const expiresAt = g.expiresAt ?? new Date(g.createdAt.getTime() + REWARD_EXPIRY_DAYS * 86_400_000);
      return { credits: g.delta, earnedAt: g.createdAt.toISOString(), expiresAt: expiresAt.toISOString(), expired: expiresAt <= now };
    }),
    freeMonth: freeMonthState({ rewardedCount, isPaid: isPaidWorkspace(workspace), claimed }),
  };
}

/** Unexpired referral credits still (possibly) in the balance, soonest first: at most the balance. */
export async function expiringCredits(workspaceId: string, balance: number, now: Date = new Date()): Promise<{ credits: number; expiresAt: string }[]> {
  if (balance <= 0) return [];
  const grants = await prisma.creditLedger.findMany({
    where: { workspaceId, reason: "referral_reward", expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
    select: { delta: true, expiresAt: true },
  });
  return capExpiring(grants.flatMap((g) => (g.expiresAt ? [{ credits: g.delta, expiresAt: g.expiresAt }] : [])), balance);
}

/** Pure: cap expiring grants (soonest first) at the current balance. */
export function capExpiring(grants: { credits: number; expiresAt: Date }[], balance: number): { credits: number; expiresAt: string }[] {
  let left = balance;
  const out: { credits: number; expiresAt: string }[] = [];
  for (const g of [...grants].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())) {
    const n = Math.min(g.credits, left);
    if (n <= 0) break;
    out.push({ credits: n, expiresAt: g.expiresAt.toISOString() });
    left -= n;
  }
  return out;
}

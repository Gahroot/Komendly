// Partner program DB actions: apply, approve/reject, payouts, and the partner dashboard loader.
import type { AdsPartner, AdsWorkspace, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { renderEmailLayout } from "@/lib/email/layout";
import { effectiveStatus, markPartnerPaid, summarizeCommissions } from "./commissions";
import { trackAdsEvent } from "./events";
import { appBaseUrl, sendAdsMail } from "./mailer";
import { demoGiftsLeft, monthStartUtc, normalizeWebsite, PARTNER_TERMS, partnerLink, type PartnerApplicationInput } from "./partner";
import { ensureReferralCode } from "./referrals";
import { SHARE_ORIGIN } from "./referrals";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function adminEmails(): Promise<string[]> {
  const fromEnv = (process.env.ADS_ADMIN_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { email: true }, orderBy: { createdAt: "asc" }, take: 3 });
  return admins.map((a) => a.email);
}

function mail(heading: string, paragraphs: string[], button: { label: string; href: string }, preheader: string) {
  const base = appBaseUrl(SHARE_ORIGIN);
  return { html: renderEmailLayout({ appUrl: base, preheader, heading, paragraphs, button }), text: [...paragraphs, "", `${button.label}: ${button.href}`].join("\n\n") };
}

/** Creates (or re-submits a rejected) application. Approved/applied partners can't re-apply. */
export async function applyAsPartner(user: User, workspace: AdsWorkspace, input: PartnerApplicationInput): Promise<ActionResult> {
  const existing = await prisma.adsPartner.findUnique({ where: { userId: user.id } });
  if (existing && existing.status !== "rejected") return { ok: false, error: existing.status === "approved" ? "You're already a partner." : "Your application is already in. We'll email you soon." };
  const data = {
    company: input.company || null,
    website: normalizeWebsite(input.website) || null,
    role: input.role,
    clientCount: input.clientCount,
    pitch: input.pitch,
    payoutEmail: input.payoutEmail,
    payoutMethod: input.payoutMethod,
    status: "applied",
    adminNote: null,
  };
  const partner = existing
    ? await prisma.adsPartner.update({ where: { id: existing.id }, data })
    : await prisma.adsPartner.create({ data: { ...data, userId: user.id, workspaceId: workspace.id } });
  await trackAdsEvent("partner_applied", { workspaceId: workspace.id, userId: user.id, props: { partnerId: partner.id, role: input.role, clientCount: input.clientCount } });
  try {
    const base = appBaseUrl(SHARE_ORIGIN);
    const lines = [
      `${user.name ?? user.email} (${user.email}) applied to the partner program.`,
      `Company: ${data.company ?? "-"} · Website: ${data.website ?? "-"} · Role: ${input.role} · Clients: ${input.clientCount}`,
      `How they'll share it: ${input.pitch}`,
    ];
    const m = mail("New partner application", lines, { label: "Review application", href: `${base}/admin/ads/partners` }, "A new partner application is waiting.");
    for (const to of await adminEmails()) await sendAdsMail({ to, subject: `Partner application: ${data.company ?? user.email}`, ...m });
  } catch (err) {
    console.error("[partner] admin notify failed", err);
  }
  return { ok: true };
}

export async function approvePartner(partnerId: string, actor: User, note: string | null): Promise<ActionResult> {
  const partner = await prisma.adsPartner.findUnique({ where: { id: partnerId } });
  if (!partner) return { ok: false, error: "Partner not found" };
  const user = await prisma.user.findUnique({ where: { id: partner.userId } });
  if (!user) return { ok: false, error: "Partner user not found" };
  const code = await ensureReferralCode({ id: partner.workspaceId }, user);
  await prisma.$transaction([
    prisma.adsReferralCode.update({ where: { workspaceId: partner.workspaceId }, data: { kind: "partner" } }),
    prisma.adsPartner.update({ where: { id: partner.id }, data: { status: "approved", approvedAt: partner.approvedAt ?? new Date(), adminNote: note } }),
  ]);
  await trackAdsEvent("admin_partner_approved", { workspaceId: partner.workspaceId, userId: partner.userId, props: { partnerId, actorId: actor.id, code } });
  try {
    const base = appBaseUrl(SHARE_ORIGIN);
    const link = partnerLink(SHARE_ORIGIN, code);
    const m = mail(
      "You're a Komendly partner",
      [
        `Hi ${user.name?.split(" ")[0] ?? "there"}, you're in. Welcome to the Komendly partner program.`,
        `Your partner link: ${link}`,
        `You earn ${PARTNER_TERMS.commissionPct}% of what your referrals pay for ${PARTNER_TERMS.commissionMonths} months, and you get ${PARTNER_TERMS.demoGiftsPerMonth} free demo gift packs every month to show clients their own ads.`,
        "Your dashboard has your link, stats, payouts and a marketing kit.",
      ],
      { label: "Open my partner dashboard", href: `${base}/ads/partner` },
      "Your partner link is ready.",
    );
    await sendAdsMail({ to: user.email, subject: "You're in: your Komendly partner link", ...m });
  } catch (err) {
    console.error("[partner] approval email failed", err);
  }
  return { ok: true };
}

export async function setPartnerStatus(partnerId: string, status: "rejected" | "paused", actor: User, note: string | null): Promise<ActionResult> {
  const partner = await prisma.adsPartner.findUnique({ where: { id: partnerId } });
  if (!partner) return { ok: false, error: "Partner not found" };
  await prisma.adsPartner.update({ where: { id: partnerId }, data: { status, adminNote: note } });
  if (status === "rejected") await trackAdsEvent("admin_partner_rejected", { workspaceId: partner.workspaceId, userId: partner.userId, props: { partnerId, actorId: actor.id, note } });
  return { ok: true };
}

export async function payPartner(partnerId: string, payoutRef: string, actor: User): Promise<ActionResult & { count?: number }> {
  const partner = await prisma.adsPartner.findUnique({ where: { id: partnerId } });
  if (!partner) return { ok: false, error: "Partner not found" };
  const { count } = await markPartnerPaid(prisma, partnerId, payoutRef, new Date());
  if (!count) return { ok: false, error: "Nothing payable yet" };
  await trackAdsEvent("admin_partner_paid", { workspaceId: partner.workspaceId, props: { partnerId, actorId: actor.id, payoutRef, count } });
  return { ok: true, count };
}

export interface PartnerStats {
  clicks: number;
  signups: number;
  trials: number;
  paying: number;
}

/** Funnel for one partner's referrals: link clicks -> sign-ups -> finished trials -> paying. */
export async function partnerStats(partner: Pick<AdsPartner, "workspaceId">): Promise<PartnerStats> {
  const referrals = await prisma.adsReferral.findMany({ where: { referrerWorkspaceId: partner.workspaceId, status: { not: "rejected" } }, select: { referredWorkspaceId: true, status: true, trialDoneAt: true } });
  const ids = referrals.map((r) => r.referredWorkspaceId);
  const [clicks, paying] = await Promise.all([
    prisma.adsEvent.count({ where: { name: "referral_landed", workspaceId: partner.workspaceId } }),
    ids.length ? prisma.adsEvent.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, name: { in: ["paid_converted", "purchased"] } } }) : Promise.resolve([]),
  ]);
  return {
    clicks,
    signups: referrals.length,
    trials: referrals.filter((r) => r.trialDoneAt || ["trial_done", "rewarded", "paid"].includes(r.status)).length,
    paying: paying.length,
  };
}

export async function loadPartnerDashboard(partner: AdsPartner, now: Date = new Date()) {
  const [code, stats, commissions, giftsThisMonth] = await Promise.all([
    prisma.adsReferralCode.findUnique({ where: { workspaceId: partner.workspaceId } }),
    partnerStats(partner),
    prisma.adsCommission.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: "desc" } }),
    prisma.adsGift.count({ where: { senderWorkspaceId: partner.workspaceId, source: "partner_demo", status: { not: "failed" }, createdAt: { gte: monthStartUtc(now) } } }),
  ]);
  const wsNames = new Map(
    (await prisma.adsWorkspace.findMany({ where: { id: { in: [...new Set(commissions.map((c) => c.referredWorkspaceId))] } }, select: { id: true, name: true } })).map((w) => [w.id, w.name]),
  );
  return {
    link: code ? partnerLink(SHARE_ORIGIN, code.code) : null,
    stats,
    summary: summarizeCommissions(commissions, now),
    commissions: commissions.slice(0, 50).map((c) => ({ ...c, status: effectiveStatus(c, now), client: wsNames.get(c.referredWorkspaceId) ?? "Client" })),
    giftsLeft: demoGiftsLeft(partner.demoGiftsPerMonth, giftsThisMonth),
  };
}

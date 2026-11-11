// Admin growth-loop loaders (referrals, gifts, partners). Maths for channels lives in funnel.ts.
import { prisma } from "@/lib/prisma";
import { effectiveStatus } from "./commissions";
import { loadSourceFunnel } from "./funnel-queries";

export const GROWTH_CHANNELS = [
  { key: "ref_link", label: "Link referrals" },
  { key: "gift", label: "Gift packs" },
  { key: "partner", label: "Partners" },
  { key: "meta_paid", label: "Meta ads" },
] as const;

export async function loadGrowthOverview(from: Date, to: Date, now: Date = new Date()) {
  const range = { gte: from, lt: to };
  const [referrals, rewards, expired, gifts, giftCost, commissions, funnel] = await Promise.all([
    prisma.adsReferral.groupBy({ by: ["source", "status"], where: { createdAt: range }, _count: { _all: true } }),
    prisma.adsReferral.aggregate({ where: { rewardedAt: range }, _sum: { rewardCredits: true }, _count: { _all: true } }),
    prisma.creditLedger.aggregate({ where: { reason: "expire", stripeRef: { startsWith: "expire:" }, createdAt: range }, _sum: { delta: true } }),
    prisma.adsGift.findMany({ where: { createdAt: range }, select: { viewCount: true, claimedAt: true, status: true } }),
    prisma.adsGift.aggregate({ where: { createdAt: range }, _sum: { costMicros: true } }),
    prisma.adsCommission.findMany({ select: { status: true, availableAt: true, commissionCents: true, amountCents: true, createdAt: true } }),
    loadSourceFunnel(from, to, "channel", now),
  ]);
  const count = (pred: (r: (typeof referrals)[number]) => boolean) => referrals.filter(pred).reduce((t, r) => t + r._count._all, 0);
  const ok = (r: { status: string }) => r.status !== "rejected";
  const owed = commissions.filter((c) => ["pending", "payable"].includes(effectiveStatus(c, now))).reduce((t, c) => t + c.commissionCents, 0);
  const inRange = commissions.filter((c) => c.status !== "void" && c.createdAt >= from && c.createdAt < to);
  const rows = funnel.funnel;
  const channels = [
    ...GROWTH_CHANNELS.map((c) => ({ ...c, row: rows.find((r) => r.key === c.key) ?? null })),
    {
      key: "other",
      label: "Other (blog, direct, campaigns)",
      row: rows.filter((r) => !GROWTH_CHANNELS.some((c) => c.key === r.key)).reduce(
        (t, r) => ({ ...t, signedUp: t.signedUp + r.signedUp, trialFinished: t.trialFinished + r.trialFinished, paid: t.paid + r.paid, revenueCents: t.revenueCents + r.revenueCents }),
        { key: "other", signedUp: 0, trialFinished: 0, paid: 0, revenueCents: 0 },
      ),
    },
  ];
  return {
    referralSignups: count((r) => ok(r) && r.source !== "partner"),
    referralTrials: count((r) => ["trial_done", "rewarded", "paid"].includes(r.status) && r.source !== "partner"),
    rejected: count((r) => r.status === "rejected"),
    rewardsGranted: rewards._count._all,
    rewardCredits: rewards._sum.rewardCredits ?? 0,
    creditsExpired: Math.abs(expired._sum.delta ?? 0),
    giftsMade: gifts.length,
    giftsViewed: gifts.filter((g) => g.viewCount > 0).length,
    giftsClaimed: gifts.filter((g) => g.claimedAt).length,
    giftCostMicros: Number(giftCost._sum.costMicros ?? 0),
    partnerSignups: count((r) => ok(r) && r.source === "partner"),
    partnerRevenueCents: inRange.reduce((t, c) => t + c.amountCents, 0),
    partnerCommissionCents: inRange.reduce((t, c) => t + c.commissionCents, 0),
    commissionsOwedCents: owed,
    channels,
  };
}

/** Display names for workspaces (owner name/email). */
export async function workspaceLabels(ids: readonly string[]): Promise<Map<string, { name: string; email: string }>> {
  const unique = [...new Set(ids)].sort();
  const ws = await prisma.adsWorkspace.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, ownerId: true } });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: ws.map((w) => w.ownerId) } }, select: { id: true, email: true, name: true } })).map((u) => [u.id, u]));
  return new Map(ws.map((w) => [w.id, { name: users.get(w.ownerId)?.name ?? w.name, email: users.get(w.ownerId)?.email ?? "" }]));
}

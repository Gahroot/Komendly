// DB loader for /admin/ads/scoreboard; all maths lives in scoreboard.ts. Read-only.
// Internal/test accounts are excluded with the shared rule (loadInternalIds, same as /admin/ads/funnel and /admin/money).
import { prisma } from "@/lib/prisma";
import { loadInternalIds } from "@/lib/internal-accounts";
import { parseFirstTouch, serializeFirstTouch, type FirstTouch } from "@/lib/analytics/first-touch";
import { buildScoreboard, channelsProducing, checkpointRows, lastWeeks, newPayments, scoreChannel, type ScoreSignup } from "./scoreboard";

const DAY_MS = 24 * 3600 * 1000;
/** Kly gifts (AdsGift.source): kly/src/hook.ts OUTBOUND_GIFT_SOURCE + founder outreach from admin. */
const KLY_GIFT_SOURCES = ["outbound", "admin_outreach"];
/** Leads not emailed yet and still usable (OutboundLead.status before "sent"). */
const UNSENT_LEAD_STATUSES = ["found", "ad_made", "queued"];

function touchOf(props: unknown): FirstTouch | null {
  const p = (props ?? {}) as { firstTouch?: unknown; meta?: { firstTouch?: unknown } };
  const t = p.firstTouch ?? p.meta?.firstTouch;
  return t && typeof t === "object" ? parseFirstTouch(serializeFirstTouch(t as FirstTouch)) : null;
}

export async function loadScoreboard(weeksShown = 10, now: Date = new Date()) {
  const internal = await loadInternalIds();
  const internalUsers = new Set(internal.userIds);
  const signedUp = (
    await prisma.adsEvent.findMany({
      where: { name: "signed_up", workspaceId: { not: null, notIn: internal.workspaceIds } },
      orderBy: { createdAt: "asc" },
      select: { workspaceId: true, userId: true, props: true, createdAt: true },
    })
  ).filter((s) => !s.userId || !internalUsers.has(s.userId));
  const firstByWs = new Map<string, (typeof signedUp)[number]>();
  for (const s of signedUp) if (s.workspaceId && !firstByWs.has(s.workspaceId)) firstByWs.set(s.workspaceId, s);
  const ids = [...firstByWs.keys()];

  const [klyLeads, klyGifts, referrals, payEvents, freePack, verifiedLeads, sends] = await Promise.all([
    prisma.outboundLead.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true } }),
    prisma.adsGift.findMany({ where: { claimedWorkspaceId: { in: ids }, source: { in: KLY_GIFT_SOURCES } }, select: { claimedWorkspaceId: true } }),
    prisma.adsReferral.findMany({ where: { referredWorkspaceId: { in: ids }, status: { not: "rejected" } }, select: { referredWorkspaceId: true } }),
    prisma.adsEvent.findMany({
      where: { name: { in: ["purchased", "paid_converted"] }, workspaceId: { not: null, notIn: internal.workspaceIds } },
      select: { workspaceId: true, name: true, props: true, createdAt: true },
    }),
    prisma.adsWorkspace.findMany({ where: { trialUsedAt: { not: null }, id: { notIn: internal.workspaceIds } }, select: { id: true } }),
    prisma.outboundLead.count({ where: { emailCheck: "valid", purgedAt: null, status: { in: UNSENT_LEAD_STATUSES } } }),
    // Last 7 full UTC days of real (non-dry-run) sequence emails.
    prisma.outboundSend.count({ where: { dryRun: false, kind: "sequence", sentAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 7 * DAY_MS), lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) } } }),
  ]);
  const kly = new Set([...klyLeads.map((l) => l.workspaceId), ...klyGifts.map((g) => g.claimedWorkspaceId)].filter((x): x is string => !!x));
  const referred = new Set(referrals.map((r) => r.referredWorkspaceId));
  const signups: ScoreSignup[] = [...firstByWs.values()].map((s) => {
    const id = s.workspaceId as string;
    return { workspaceId: id, at: s.createdAt, channel: scoreChannel({ touch: touchOf(s.props), klyLead: kly.has(id), referral: referred.has(id) }) };
  });

  const payments = newPayments(payEvents.flatMap((e) => (e.workspaceId ? [{ ...e, workspaceId: e.workspaceId }] : [])));
  const payers = [...new Set(payments.map((p) => p.workspaceId))];
  const live = payers.length
    ? await prisma.metaPublish.findMany({ where: { status: "published", ad: { workspaceId: { in: payers } } }, select: { ad: { select: { workspaceId: true } } } })
    : [];
  const freePackIds = new Set(freePack.map((w) => w.id));
  const since7d = new Date(now.getTime() - 7 * DAY_MS);

  const board = buildScoreboard(signups, payments, lastWeeks(weeksShown, now));
  const checkpoints = checkpointRows({
    freePackWorkspaces: freePackIds.size,
    freePackPaid: payers.filter((id) => freePackIds.has(id)).length,
    verifiedLeadsAvailable: verifiedLeads,
    emailsPerDay: sends / 7,
    signupsLast7d: signups.filter((s) => s.at >= since7d).length,
    channelsLast7d: channelsProducing(signups, since7d),
    payingCustomers: payers.length,
    customersWithAdsLive: new Set(live.map((m) => m.ad.workspaceId)).size,
  });
  return { ...board, checkpoints, totalSignups: signups.length, recentPayments: payments.slice(-10).reverse() };
}

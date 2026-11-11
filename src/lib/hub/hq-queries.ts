// DB loader for Ozzy HQ (/admin, /api/admin/hq). Reuses the ads admin loaders; maths in hq.ts.
import { loadInternalIds } from "@/lib/internal-accounts";
import { prisma } from "@/lib/prisma";
import { loadAdsOverview } from "@/lib/ads/metrics-queries";
import { loadSignups } from "@/lib/ads/signups-queries";
import { attentionList, creditsSpentByApp, legacyMrr, windowCounts } from "./hq";

const DAY_MS = 86_400_000;
const STALE_MS = 2 * 60 * 1000;

export async function loadHq(now: Date = new Date()) {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const internal = await loadInternalIds();
  const ws = { notIn: internal.workspaceIds };
  const uid = { notIn: internal.userIds };
  const [
    ads, signups, trialsStarted, trialsFinished, studioSessions, studioRenders, studioFree, paidConverted,
    legacyUsers, packs, ledger, testiVideos, testiCost, testiFailed, beats, deadJobs, abuse, payable, refunds, studioErrors,
  ] = await Promise.all([
    loadAdsOverview(now),
    loadSignups(since30, now, { source: "all", stage: "all", showTest: false }),
    prisma.adsEvent.findMany({ where: { name: "trial_started", createdAt: { gte: since30 }, workspaceId: ws }, select: { createdAt: true } }),
    prisma.adRun.count({ where: { isTrial: true, status: { in: ["completed", "partial"] }, completedAt: { gte: since30 }, workspaceId: ws } }),
    prisma.studioSession.findMany({ where: { createdAt: { gte: since30 }, userId: uid }, select: { createdAt: true } }),
    prisma.studioRender.count({ where: { createdAt: { gte: since30 }, workspaceId: ws } }),
    prisma.studioRender.count({ where: { createdAt: { gte: since30 }, free: true, workspaceId: ws } }),
    prisma.adsEvent.count({ where: { name: "paid_converted", createdAt: { gte: since30 }, workspaceId: ws } }),
    prisma.user.findMany({ where: { plan: { in: ["starter", "pro", "enterprise"] }, id: uid }, select: { plan: true, subscriptionStatus: true } }),
    prisma.creditPurchase.aggregate({ where: { createdAt: { gte: since30 }, userId: uid }, _sum: { amountPaid: true }, _count: true }),
    prisma.creditLedger.groupBy({ by: ["reason"], where: { createdAt: { gte: since30 }, workspaceId: ws }, _sum: { delta: true } }),
    prisma.falCompositeVideo.count({ where: { status: "completed", completedAt: { gte: since30 } } }),
    prisma.falCompositeVideo.aggregate({ where: { createdAt: { gte: since30 } }, _sum: { costMicros: true, minutesCharged: true } }),
    prisma.falCompositeVideo.count({ where: { status: "failed", createdAt: { gte: since7 } } }),
    prisma.engineHeartbeat.findMany({ orderBy: [{ kind: "asc" }, { id: "asc" }] }),
    prisma.adJob.count({ where: { status: "dead", createdAt: { gte: since7 } } }),
    prisma.abuseFlag.count({ where: { status: "open" } }),
    prisma.adsCommission.aggregate({ where: { status: "payable" }, _sum: { commissionCents: true }, _count: true }),
    prisma.adsRefund.count({ where: { createdAt: { gte: since7 } } }),
    prisma.studioSession.count({ where: { status: "error", lastActivityAt: { gte: since7 } } }),
  ]);
  const legacy = legacyMrr(legacyUsers);
  const credits = creditsSpentByApp(ledger.map((l) => ({ reason: l.reason, delta: l._sum.delta ?? 0 })));
  const workers = beats.filter((b) => b.kind === "worker");
  const codex = beats.find((b) => b.id === "provider:codex") ?? null;
  const liveWorkers = workers.filter((b) => now.getTime() - b.updatedAt.getTime() < STALE_MS && b.ok).length;
  const attention = attentionList([
    { key: "dead_jobs", label: "Failed engine jobs (7d)", count: deadJobs, href: "/admin/ads/jobs", tone: "bad" },
    { key: "studio_errors", label: "Studio sessions with errors (7d)", count: studioErrors, href: "/admin/studio", tone: "bad" },
    { key: "testi_failed", label: "Failed testimonial videos (7d)", count: testiFailed, href: "/admin/videos", tone: "bad" },
    { key: "abuse", label: "Open abuse flags", count: abuse, href: "/admin/ads/abuse", tone: "warn" },
    { key: "payable", label: `Partner commissions to pay (${((payable._sum.commissionCents ?? 0) / 100).toFixed(2)} USD)`, count: payable._count, href: "/admin/ads/partners", tone: "warn" },
    { key: "refunds", label: "Refunds issued (7d)", count: refunds, href: "/admin/ads/refunds", tone: "warn" },
    ...(codex && !codex.ok ? [{ key: "codex", label: `Codex login: ${codex.message ?? "not ok"}`, count: 1, href: "/admin/ads/engine", tone: "bad" as const }] : []),
    ...(workers.length > 0 && liveWorkers === 0 ? [{ key: "engine", label: "No live engine worker", count: 1, href: "/admin/ads/engine", tone: "bad" as const }] : []),
  ]);
  return {
    generatedAt: now.toISOString(),
    signups: windowCounts(signups.rows.map((r) => r.signedUpAt), now),
    trials: { started30d: trialsStarted.length, startedWindows: windowCounts(trialsStarted.map((t) => t.createdAt), now), finished30d: trialsFinished },
    studio: { sessions: windowCounts(studioSessions.map((s) => s.createdAt), now), renders30d: studioRenders, freeRenders30d: studioFree },
    money: {
      adsMrrCents: ads.mrrCents,
      adsSubscribers: ads.activeSubscribers,
      legacyMrrCents: legacy.mrrCents,
      legacySubscribers: legacy.subscribers,
      paidConversions30d: paidConverted + packs._count,
      revenue30dCents: ads.revenue30dCents + (packs._sum.amountPaid ?? 0),
      trialToPaid: ads.conversion.overall,
    },
    credits30d: { ...credits, testimonialVideos: testiCost._sum.minutesCharged ?? 0 },
    testimonials: { videos30d: testiVideos, costUsd30d: Number(testiCost._sum.costMicros ?? BigInt(0)) / 1e6 },
    engine: {
      workers: workers.map((w) => ({ id: w.id, ok: w.ok, live: now.getTime() - w.updatedAt.getTime() < STALE_MS, updatedAt: w.updatedAt.toISOString() })),
      codex: codex ? { ok: codex.ok, message: codex.message, updatedAt: codex.updatedAt.toISOString() } : null,
      cost30dUsd: ads.cost30dUsd,
    },
    attention,
  };
}

export type Hq = Awaited<ReturnType<typeof loadHq>>;

/** Recent Studio sessions for /admin/studio. */
export async function loadStudioSessions(limit = 50) {
  const sessions = await prisma.studioSession.findMany({
    orderBy: [{ lastActivityAt: "desc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true, title: true, status: true, freeVideo: true, createdAt: true, lastActivityAt: true, userId: true,
      workspace: { select: { name: true } },
      _count: { select: { renders: true, messages: true } },
      renders: { select: { creditsCharged: true, costMicros: true } },
    },
  });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(sessions.map((s) => s.userId))] } }, select: { id: true, email: true } });
  const email = new Map(users.map((u) => [u.id, u.email]));
  return sessions.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    freeVideo: s.freeVideo,
    workspace: s.workspace.name,
    email: email.get(s.userId) ?? "—",
    renders: s._count.renders,
    messages: s._count.messages,
    credits: s.renders.reduce((t, r) => t + r.creditsCharged, 0),
    costUsd: s.renders.reduce((t, r) => t + Number(r.costMicros), 0) / 1e6,
    lastActivityAt: s.lastActivityAt,
  }));
}

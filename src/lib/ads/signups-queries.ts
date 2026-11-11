// DB loader for /admin/ads/signups; row logic lives in signups.ts.
import { prisma } from "@/lib/prisma";
import { parseFirstTouch, serializeFirstTouch, type FirstTouch } from "@/lib/analytics/first-touch";
import { resolveMetaNames } from "./meta-insights";
import { buildSignupRow, filterSignupRows, type SignupFilter, type SignupView } from "./signups";

const EVENT_NAMES = ["trial_started", "first_ad_ready", "run_completed", "export_downloaded", "upsell_shown", "checkout_started", "purchased", "renewed", "paid_converted", "churned"];

function touchOf(props: unknown): FirstTouch | null {
  const p = (props ?? {}) as { firstTouch?: unknown; meta?: { firstTouch?: unknown } };
  const t = p.firstTouch ?? p.meta?.firstTouch;
  return t && typeof t === "object" ? parseFirstTouch(serializeFirstTouch(t as FirstTouch)) : null;
}

/** Sign-ups in [from, to), filtered, newest first, plus Meta id -> name map (empty without token). */
export async function loadSignups(from: Date, to: Date, filter: SignupFilter): Promise<{ rows: SignupView[]; total: number; names: Map<string, string> }> {
  const signedUp = await prisma.adsEvent.findMany({
    where: { name: "signed_up", createdAt: { gte: from, lt: to }, workspaceId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: { workspaceId: true, userId: true, props: true, createdAt: true },
  });
  const ids = [...new Set(signedUp.map((s) => s.workspaceId).filter((x): x is string => !!x))];
  const userIds = [...new Set(signedUp.map((s) => s.userId).filter((x): x is string => !!x))];
  const [users, workspaces, events, runs, adCounts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, emailVerifiedAt: true } }),
    prisma.adsWorkspace.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, adsPlan: true, subscriptionStatus: true, stripeSubscriptionId: true, canceledAt: true } }),
    prisma.adsEvent.findMany({ where: { workspaceId: { in: ids }, name: { in: EVENT_NAMES } }, select: { workspaceId: true, name: true, props: true, createdAt: true } }),
    prisma.adRun.findMany({ where: { workspaceId: { in: ids } }, select: { workspaceId: true, url: true, isTrial: true, status: true, createdAt: true, firstAdAt: true, completedAt: true } }),
    prisma.ad.groupBy({ by: ["workspaceId", "status"], where: { workspaceId: { in: ids } }, _count: true }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const all = signedUp.flatMap((s) => {
    const id = s.workspaceId;
    if (!id) return [];
    const u = s.userId ? userById.get(s.userId) : undefined;
    const w = wsById.get(id);
    const counts = adCounts.filter((c) => c.workspaceId === id);
    return [buildSignupRow({
      userId: s.userId,
      email: u?.email ?? null,
      emailVerifiedAt: u?.emailVerifiedAt ?? null,
      workspaceId: id,
      workspaceName: w?.name ?? null,
      signedUpAt: s.createdAt,
      touch: touchOf(s.props),
      events: events.filter((e) => e.workspaceId === id),
      runs: runs.filter((r) => r.workspaceId === id),
      adsReady: counts.filter((c) => c.status === "ready").reduce((t, c) => t + c._count, 0),
      adsTotal: counts.reduce((t, c) => t + c._count, 0),
      workspace: w ?? null,
    })];
  });
  const rows = filterSignupRows(all, filter);
  const names = await resolveMetaNames(rows.filter((r) => r.isMeta).flatMap((r) => [r.utmCampaign, r.utmContent, r.utmTerm].filter((x): x is string => !!x)));
  return { rows, total: all.length, names };
}

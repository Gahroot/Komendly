// DB loader for /admin/money (read-only). All maths lives in money.ts / systems.ts / monitor.ts.
import { prisma } from "@/lib/prisma";
import { loadInternalIds } from "@/lib/internal-accounts";
import { isInternalEmail } from "@/lib/internal-email";
import { parseFirstTouch, serializeFirstTouch, type FirstTouch } from "@/lib/analytics/first-touch";
import { classifyTouch, realVisits, revenuePayments } from "@/lib/ads/funnel";
import { ADS_PLANS } from "@/lib/ads/billing-config";
import { loadMetaCampaignSpend } from "@/lib/ads/meta-insights";
import { PLAN_CONFIG, type PlanKey } from "@/lib/stripe-config";
import { isYearlyPrice } from "@/lib/stripe";
import { TESTIMONIAL_PAID_EVENT } from "@/lib/ads/founder-alert";
import { GROWTH_SYSTEMS, parseBeat, systemHeartbeatId, type SystemBeat } from "./systems";
import { MONITOR_HEARTBEAT_ID, monitorHealth, parseMonitorBeat, providerProblem } from "./monitor";
import { channelFunnel, healthGrid, moneyByPeriod, mrr, periodStart, recoveryCounts, todaysPayments, PERIODS, type FunnelSignup, type Payment, type Period, type Subscriber } from "./money";

const ACTIVE_ADS = new Set(["active", "past_due", "trialing"]);
const amountOf = (props: unknown) => {
  const a = (props as { amountCents?: unknown } | null)?.amountCents;
  return typeof a === "number" ? a : 0;
};
function touchOf(props: unknown): FirstTouch | null {
  const p = (props ?? {}) as { firstTouch?: unknown; meta?: { firstTouch?: unknown } };
  const t = p.firstTouch ?? p.meta?.firstTouch;
  return t && typeof t === "object" ? parseFirstTouch(serializeFirstTouch(t as FirstTouch)) : null;
}

export async function loadMoneyDashboard(funnelPeriod: Period = "all", now: Date = new Date()) {
  const internal = await loadInternalIds();
  const internalWs = new Set(internal.workspaceIds);
  const internalUsers = new Set(internal.userIds);
  const [adsPays, tPacks, tSubsEv, signups, activeWs, activeUsers] = await Promise.all([
    prisma.adsEvent.findMany({ where: { name: { in: ["purchased", "renewed", "paid_converted"] }, workspaceId: { not: null } }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, name: true, props: true, createdAt: true } }),
    prisma.creditPurchase.findMany({ select: { userId: true, amountPaid: true, minutes: true, createdAt: true } }),
    prisma.adsEvent.findMany({ where: { name: TESTIMONIAL_PAID_EVENT, props: { path: ["kind"], equals: "subscription" } }, select: { userId: true, props: true, createdAt: true } }),
    prisma.adsEvent.findMany({ where: { name: "signed_up" }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, userId: true, props: true, createdAt: true } }),
    prisma.adsWorkspace.findMany({ where: { stripeSubscriptionId: { not: null }, subscriptionStatus: { in: [...ACTIVE_ADS] } }, select: { id: true, adsPlan: true, subscriptionStatus: true } }),
    prisma.user.findMany({ where: { subscriptionStatus: { in: ["active", "past_due"] }, plan: { in: ["starter", "pro", "enterprise"] } }, select: { id: true, email: true, plan: true, subscriptionPriceId: true, subscriptionStatus: true } }),
  ]);
  const touchByWs = new Map<string, FirstTouch | null>();
  const touchByUser = new Map<string, FirstTouch | null>();
  for (const s of signups) {
    if (s.workspaceId && !touchByWs.has(s.workspaceId)) touchByWs.set(s.workspaceId, touchOf(s.props));
    if (s.userId && !touchByUser.has(s.userId)) touchByUser.set(s.userId, touchOf(s.props));
  }
  // Who: workspace owners + testimonial users.
  const wsIds = [...new Set(adsPays.map((p) => p.workspaceId as string))].filter((id) => !internalWs.has(id));
  const owners = await prisma.adsWorkspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, ownerId: true } });
  const userIds = [...new Set([...owners.map((o) => o.ownerId), ...tPacks.map((p) => p.userId), ...tSubsEv.flatMap((e) => (e.userId ? [e.userId] : []))])];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  const ownerOf = new Map(owners.map((o) => [o.id, o.ownerId]));
  const real = (userId: string | undefined) => !!userId && !internalUsers.has(userId) && !isInternalEmail(users.get(userId) ?? null);

  const payments: Payment[] = [];
  for (const ws of wsIds) {
    const owner = ownerOf.get(ws);
    if (!real(owner)) continue;
    for (const p of revenuePayments(adsPays.filter((x) => x.workspaceId === ws))) {
      const props = (p.props ?? {}) as Record<string, unknown>;
      payments.push({ at: p.createdAt, billing: "ads", customerId: `ads:${ws}`, who: users.get(owner!) ?? ws, what: `${p.name === "renewed" ? "renewal " : ""}${String(props.key ?? props.kind ?? props.plan ?? "plan")}`, amountCents: amountOf(p.props), channel: classifyTouch(touchByWs.get(ws) ?? null).channel });
    }
  }
  for (const p of tPacks) if (real(p.userId)) payments.push({ at: p.createdAt, billing: "testimonials", customerId: `t:${p.userId}`, who: users.get(p.userId) ?? p.userId, what: `credit pack (${p.minutes} min)`, amountCents: p.amountPaid, channel: classifyTouch(touchByUser.get(p.userId) ?? null).channel });
  for (const e of tSubsEv) if (e.userId && real(e.userId)) payments.push({ at: e.createdAt, billing: "testimonials", customerId: `t:${e.userId}`, who: users.get(e.userId) ?? e.userId, what: String((e.props as { what?: unknown })?.what ?? "subscription"), amountCents: amountOf(e.props), channel: classifyTouch(touchByUser.get(e.userId) ?? null).channel });

  // MRR (from DB plan prices; yearly testimonial prices / 12).
  const subs: Subscriber[] = [
    ...activeWs.filter((w) => !internalWs.has(w.id)).map((w) => ({ billing: "ads" as const, customerId: `ads:${w.id}`, monthlyCents: ADS_PLANS.find((p) => p.key === w.adsPlan)?.priceCents ?? 0 })),
    ...activeUsers.filter((u) => !internalUsers.has(u.id) && !isInternalEmail(u.email)).map((u) => {
      const cfg = PLAN_CONFIG[u.plan as PlanKey];
      const yearly = u.subscriptionPriceId ? isYearlyPrice(u.subscriptionPriceId) : false;
      return { billing: "testimonials" as const, customerId: `t:${u.id}`, monthlyCents: cfg ? Math.round(yearly ? (cfg.yearlyPrice * 100) / 12 : cfg.monthlyPrice * 100) : 0 };
    }),
  ];

  // Funnel per channel / system for the chosen period.
  const from = periodStart(funnelPeriod, now) ?? new Date("2025-01-01T00:00:00Z");
  const internalAnon = new Set(internal.anonIds);
  const landedAll = await prisma.adsEvent.findMany({ where: { name: "visit_landed", createdAt: { gte: from } }, select: { props: true, createdAt: true } });
  const visits = realVisits(landedAll, internalAnon).visits.map((l) => touchOf(l.props));
  const periodSignups = signups.filter((s) => s.workspaceId && s.createdAt >= from && !internalWs.has(s.workspaceId));
  const ids = periodSignups.map((s) => s.workspaceId as string);
  const [trials, checkouts] = await Promise.all([
    prisma.adRun.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, isTrial: true, status: { in: ["completed", "partial"] } }, _count: true }),
    prisma.adsEvent.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: ids }, name: "checkout_started" }, _count: true }),
  ]);
  const trialSet = new Set(trials.map((t) => t.workspaceId));
  const checkoutSet = new Set(checkouts.map((c) => c.workspaceId));
  const paidSet = new Set(payments.map((p) => p.customerId));
  const fSignups: FunnelSignup[] = periodSignups.map((s) => ({ customerId: `ads:${s.workspaceId}`, touch: touchOf(s.props), freeAd: trialSet.has(s.workspaceId as string), checkout: checkoutSet.has(s.workspaceId), paid: paidSet.has(`ads:${s.workspaceId}`) }));
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const spend = await loadMetaCampaignSpend(day(from), day(now));
  const metaSpend = spend.campaigns.reduce((t, c) => t + c.spendCents, 0);

  // Recovery / churn.
  const recEvents = (await prisma.adsEvent.findMany({ where: { name: { in: ["checkout_recovered", "churned", "winback_recovered", "payment_recovered"] } }, select: { name: true, createdAt: true, workspaceId: true, userId: true } }))
    .filter((e) => !e.workspaceId || !internalWs.has(e.workspaceId)).map((e) => ({ name: e.name, at: e.createdAt }));
  const [tCanceled, failedAds, failedT] = await Promise.all([
    prisma.user.findMany({ where: { subscriptionStatus: "canceled", stripeCustomerId: { not: null } }, select: { id: true, updatedAt: true } }),
    prisma.adsWorkspace.count({ where: { subscriptionStatus: "past_due" } }),
    prisma.user.count({ where: { subscriptionStatus: "past_due" } }),
  ]);
  // Testimonial cancellations now write a churned event (winback); only count users without one here (no double count).
  const churnedUsers = new Set((await prisma.adsEvent.findMany({ where: { name: "churned", props: { path: ["billing"], equals: "testimonials" } }, select: { userId: true } })).map((e) => e.userId));
  const extraLost = tCanceled.filter((u) => !churnedUsers.has(u.id)).map((u) => u.updatedAt);

  // Health.
  const [flags, beats] = await Promise.all([
    prisma.adsFeatureFlag.findMany({ where: { key: { startsWith: "sys_" } } }),
    prisma.engineHeartbeat.findMany({ where: { id: { in: [...GROWTH_SYSTEMS.map((s) => systemHeartbeatId(s.key)), MONITOR_HEARTBEAT_ID, "provider:codex"] } } }),
  ]);
  const beatMap = new Map<string, SystemBeat>(beats.filter((b) => b.id.startsWith("system:")).map((b) => [b.id.slice(7), parseBeat(b.meta)]));
  const mon = beats.find((b) => b.id === MONITOR_HEARTBEAT_ID);
  const monBeat = mon ? parseMonitorBeat(mon.meta) : null;
  const codex = beats.find((b) => b.id === "provider:codex") ?? null;

  return {
    now,
    periods: moneyByPeriod(payments, now, subs.map((s) => s.customerId)),
    today: todaysPayments(payments, now),
    mrr: mrr(subs),
    funnelPeriod,
    byChannel: channelFunnel(visits, fSignups, "channel", { meta_paid: metaSpend }),
    bySystem: channelFunnel(visits, fSignups, "system"),
    spendStatus: spend.status,
    recovery: PERIODS.map((p) => ({ period: p, ...recoveryCounts(recEvents, extraLost, failedAds + failedT, p, now) })),
    health: healthGrid(new Map(flags.map((f) => [f.key, f.enabled])), beatMap, now),
    monitor: { health: monitorHealth(monBeat, now), beat: monBeat },
    codex: { problem: providerProblem(codex, now), alertedAt: monBeat?.codexAlertedAt ?? null },
  };
}

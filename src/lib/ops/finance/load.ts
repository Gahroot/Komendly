// Finance loader: reads the same ledgers as src/lib/revenue/economics.ts (loadEconomicsInput: de-duplicated, internal
// accounts dropped) plus AdRun/Kly cost counters, AdsRefund and ad_spend events. Read-only. Works with the web, engine
// and kly Prisma clients. Env is read inside functions.
import { channelOfTouch, loadEconomicsInput, type EconomicsDb } from "../../revenue/economics";
import { buildPnl, periodBounds, unnecessaryCandidates, type ChannelFact, type Pnl } from "./pnl";
import { summarizeFixed, type FixedItem } from "./fixed-costs";

export const FINANCE_EVENT = "finance_snapshot";
export const DAY = 86_400_000;
const envNum = (v: string | undefined): number | null => { if (v === undefined || v.trim() === "") return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };

export type Finance = {
  asOf: string; week: Pnl; month: Pnl;
  fixed: { monthlyCents: number; unknown: { id: string; name: string }[]; infraFromEnv: boolean };
  candidates: ReturnType<typeof unnecessaryCandidates>;
  needsInput: string[];
};

export async function loadFinance(db: EconomicsDb, fixedItems: readonly FixedItem[], now: Date = new Date(), env: Record<string, string | undefined> = process.env): Promise<Finance> {
  const econ = await loadEconomicsInput(db, now, 90, env);
  const fixed = summarizeFixed(fixedItems, env);
  const realWs = new Set<string>([...econ.signups.map((s) => s.workspaceId), ...econ.payments.map((p) => p.workspaceId)]);
  const channelOf = new Map(econ.signups.map((s) => [s.workspaceId, channelOfTouch(s.touch)]));
  const emailPerSend = envNum(env.FIN_EMAIL_CENTS_PER_SEND);
  const mediaMonthly = envNum(env.FIN_MEDIA_MONTHLY_CENTS);
  const cash = envNum(env.FIN_CASH_CENTS);

  const since = new Date(now.getTime() - 70 * DAY);
  const [refunds, runs, klyDaily, spend, sends, cbEvents] = await Promise.all([
    db.adsRefund.findMany({ where: { createdAt: { gte: since } }, select: { workspaceId: true, amountCents: true, createdAt: true } }),
    db.adRun.findMany({ where: { createdAt: { gte: since } }, select: { costMicros: true, createdAt: true } }),
    db.klyDaily?.findMany?.({ where: { day: { gte: since } }, select: { day: true, costMicros: true, sent: true } }).catch(() => []) ?? [],
    db.adsEvent.findMany({ where: { name: "ad_spend", createdAt: { gte: since } }, select: { props: true, createdAt: true } }),
    db.outboundSend?.findMany?.({ where: { sentAt: { gte: since }, dryRun: false }, select: { sentAt: true } }).catch(() => []) ?? [],
    db.adsEvent.findMany({ where: { name: { in: ["dispute_created", "chargeback", "charge_dispute_created"] }, createdAt: { gte: since } }, select: { props: true, createdAt: true, workspaceId: true } }),
  ]);
  const realRefunds = refunds.filter((r: any) => realWs.has(r.workspaceId));
  const inRange = <T,>(rows: T[], at: (r: T) => Date, from: Date, to: Date) => rows.filter((r) => at(r) >= from && at(r) < to);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  // AI cost per day, last 14 days, for the anomaly check
  const aiPerDay = (to: Date) => Array.from({ length: 14 }, (_, k) => {
    const d0 = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - (13 - k) * DAY);
    return Math.round(runs.filter((r: any) => dayKey(r.createdAt) === dayKey(d0)).reduce((t: number, r: any) => t + Number(r.costMicros ?? 0), 0) / 10_000);
  });

  const firstPayAt = new Map<string, Date>();
  for (const p of [...econ.payments].sort((a, b) => a.at.getTime() - b.at.getTime())) if (!firstPayAt.has(p.workspaceId)) firstPayAt.set(p.workspaceId, p.at);

  const period = (kind: "week" | "month"): Pnl => {
    const { from, to, label } = periodBounds(kind, now);
    const days = Math.round((to.getTime() - from.getTime()) / DAY);
    const pays = inRange(econ.payments, (p) => p.at, from, to);
    const gross = pays.reduce((t, p) => t + p.amountCents, 0);
    const ref = inRange(realRefunds, (r: any) => r.createdAt, from, to);
    const aiMicros = inRange(runs, (r: any) => r.createdAt, from, to).reduce((t: number, r: any) => t + Number(r.costMicros ?? 0), 0);
    const kly = inRange(klyDaily as any[], (r) => r.day, from, to).reduce((t, r) => t + Number(r.costMicros ?? 0), 0);
    const sp = inRange(spend, (r: any) => r.createdAt, from, to);
    const metaKnown = spend.length > 0;
    const metaCents = metaKnown ? sp.reduce((t: number, r: any) => t + (typeof r.props?.amountCents === "number" ? r.props.amountCents : 0), 0) : null;
    const sentN = inRange(sends as any[], (r) => r.sentAt, from, to).length;
    const cb = inRange(cbEvents, (r: any) => r.createdAt, from, to);
    const newCustomers = [...firstPayAt.values()].filter((d) => d >= from && d < to).length;
    const chans = new Map<string, ChannelFact>();
    const get = (c: string) => chans.get(c) ?? (chans.set(c, { channel: c, revenueCents: 0, acquisitionCents: c === "meta_paid" ? metaCents : c === "kly_email" ? Math.round(kly / 10_000) : 0, signups: 0, payments: 0 }), chans.get(c)!);
    for (const p of pays) { const c = get(channelOf.get(p.workspaceId) ?? "direct"); c.revenueCents += p.amountCents; c.payments += 1; }
    for (const s of econ.signups) if (s.at >= from && s.at < to) get(channelOf.get(s.workspaceId) ?? "direct").signups += 1;
    if (metaCents !== null) get("meta_paid");
    return buildPnl({
      label, from, to, grossRevenueCents: gross, paymentCount: pays.length,
      refundCents: ref.reduce((t: number, r: any) => t + r.amountCents, 0), refundCount: ref.length,
      chargebackCents: cbEvents.length ? cb.reduce((t: number, r: any) => t + Math.abs(Number(r.props?.amountCents ?? 0)), 0) : null,
      chargebackCount: cbEvents.length ? cb.length : null,
      aiCents: Math.round(aiMicros / 10_000), mediaCents: mediaMonthly === null ? null : Math.round((mediaMonthly * days) / 30),
      emailCents: emailPerSend === null ? null : Math.round(sentN * emailPerSend),
      klyCents: Math.round(kly / 10_000), metaSpendCents: metaCents, fixed, cashCents: cash,
      channels: [...chans.values()], newCustomers, dailyCostCents: aiPerDay(to),
    });
  };

  const month = period("month"), week = period("week");
  const kslSends30 = (sends as any[]).filter((s) => s.sentAt >= new Date(now.getTime() - 30 * DAY)).length;
  const runs30 = runs.filter((r: any) => r.createdAt >= new Date(now.getTime() - 30 * DAY)).length;
  const candidates = unnecessaryCandidates(fixed.known.concat(fixed.unknown).map((item) => {
    const k = (item as FixedItem & { outcomeKey?: string }).outcomeKey;
    return { item, outcomes: k === "kly_sends" ? kslSends30 : k === "ad_runs" ? runs30 : null };
  }));
  return {
    asOf: now.toISOString(), week, month,
    fixed: { monthlyCents: fixed.monthlyCents, unknown: fixed.unknown.map((u) => ({ id: u.id, name: u.name })), infraFromEnv: fixed.infraFromEnv },
    candidates, needsInput: [...new Set([...month.needsInput, ...week.needsInput])],
  };
}

// Money dashboard maths (pure, no I/O): paying customers / revenue / MRR across both billing systems, the per-channel
// funnel (visitors -> sign-ups -> free ads -> checkouts -> paying) with cost per paying customer, and the system
// health grid. DB loading lives in money-queries.ts.
import { classifyTouch, type Channel } from "@/lib/ads/funnel";
import type { FirstTouch } from "@/lib/analytics/first-touch";
import { GROWTH_SYSTEMS, systemForTouch, systemHealth, type SystemBeat, type SystemHealth, type SystemKey } from "./systems";

export type BillingSystem = "ads" | "testimonials";
export type Period = "today" | "week" | "all";
export const PERIODS: readonly Period[] = ["today", "week", "all"];

export interface Payment {
  at: Date;
  billing: BillingSystem;
  /** Stable customer id: `ads:<workspaceId>` or `t:<userId>`. */
  customerId: string;
  who: string;
  what: string;
  amountCents: number;
  /** Acquisition channel (funnel.ts) of the customer's first touch. */
  channel: Channel;
}

/** Start of today / this week (Monday) in UTC; null = all time. */
export function periodStart(p: Period, now: Date): Date | null {
  if (p === "all") return null;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (p === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export interface PeriodMoney { period: Period; payingCustomers: number; newPayingCustomers: number; revenueCents: number; byBilling: Record<BillingSystem, number> }

/**
 * Per period: distinct customers who paid in it, customers whose FIRST payment ever falls in it, revenue.
 * `alsoPaying` (current subscribers without a payment record) count toward the all-time paying total.
 */
export function moneyByPeriod(payments: readonly Payment[], now: Date, alsoPaying: readonly string[] = []): PeriodMoney[] {
  const first = new Map<string, number>();
  for (const p of payments) first.set(p.customerId, Math.min(first.get(p.customerId) ?? Infinity, p.at.getTime()));
  return PERIODS.map((period) => {
    const from = periodStart(period, now)?.getTime() ?? -Infinity;
    const inP = payments.filter((p) => p.at.getTime() >= from && p.at.getTime() <= now.getTime());
    const customers = new Set(inP.map((p) => p.customerId));
    if (period === "all") alsoPaying.forEach((c) => customers.add(c));
    const byBilling = { ads: 0, testimonials: 0 } as Record<BillingSystem, number>;
    inP.forEach((p) => (byBilling[p.billing] += p.amountCents));
    return {
      period,
      payingCustomers: customers.size,
      newPayingCustomers: [...first.entries()].filter(([, t]) => t >= from && t <= now.getTime()).length,
      revenueCents: inP.reduce((t, p) => t + p.amountCents, 0),
      byBilling,
    };
  });
}

/** Today's payments, newest first, flagged when it's that customer's first payment ever. */
export function todaysPayments(payments: readonly Payment[], now: Date): (Payment & { firstPayment: boolean })[] {
  const from = periodStart("today", now)!.getTime();
  const firstAt = new Map<string, number>();
  for (const p of payments) firstAt.set(p.customerId, Math.min(firstAt.get(p.customerId) ?? Infinity, p.at.getTime()));
  return payments.filter((p) => p.at.getTime() >= from).sort((a, b) => b.at.getTime() - a.at.getTime()).map((p) => ({ ...p, firstPayment: firstAt.get(p.customerId) === p.at.getTime() }));
}

export interface Subscriber { billing: BillingSystem; customerId: string; monthlyCents: number }
export function mrr(subs: readonly Subscriber[]): { totalCents: number; byBilling: Record<BillingSystem, number>; subscribers: number } {
  const byBilling = { ads: 0, testimonials: 0 } as Record<BillingSystem, number>;
  subs.forEach((s) => (byBilling[s.billing] += s.monthlyCents));
  return { totalCents: byBilling.ads + byBilling.testimonials, byBilling, subscribers: new Set(subs.map((s) => s.customerId)).size };
}

// ---- funnel per channel ----------------------------------------------------------------------------------------
export type FunnelSignup = { customerId: string; touch: FirstTouch | null; freeAd: boolean; checkout: boolean; paid: boolean };
export type ChannelRow = { key: string; visitors: number; signups: number; freeAds: number; checkouts: number; paying: number; spendCents: number; costPerPayingCents: number | null };

const emptyChannel = (key: string): ChannelRow => ({ key, visitors: 0, signups: 0, freeAds: 0, checkouts: 0, paying: 0, spendCents: 0, costPerPayingCents: null });

/**
 * Group the funnel by `by`: "channel" = funnel.ts channels (each growth system is its own sys_<key> channel),
 * "system" = registry system (or "(none)"). `spend` is cents per channel key (Meta spend under meta_paid; others $0).
 * Cost per paying customer = spend / paying (null when nobody paid; 0 spend -> 0).
 */
export function channelFunnel(visits: readonly (FirstTouch | null)[], signups: readonly FunnelSignup[], by: "channel" | "system", spend: Partial<Record<string, number>> = {}): ChannelRow[] {
  const keyOf = (t: FirstTouch | null) => (by === "channel" ? classifyTouch(t).channel : systemForTouch(t) ?? "(none)");
  const rows = new Map<string, ChannelRow>();
  const get = (k: string) => rows.get(k) ?? rows.set(k, emptyChannel(k)).get(k)!;
  if (by === "system") GROWTH_SYSTEMS.forEach((s) => get(s.key));
  visits.forEach((t) => (get(keyOf(t)).visitors += 1));
  for (const s of signups) {
    const r = get(keyOf(s.touch));
    r.signups += 1;
    if (s.freeAd) r.freeAds += 1;
    if (s.checkout) r.checkouts += 1;
    if (s.paid) r.paying += 1;
  }
  for (const [k, c] of Object.entries(spend)) if (c) get(k).spendCents += c;
  return [...rows.values()]
    .map((r) => ({ ...r, costPerPayingCents: r.paying > 0 ? Math.round(r.spendCents / r.paying) : null }))
    .sort((a, b) => b.paying - a.paying || b.signups - a.signups || b.visitors - a.visitors || a.key.localeCompare(b.key));
}

// ---- recovery / churn -------------------------------------------------------------------------------------------
export const RECOVERY_EVENTS = { recovered: "checkout_recovered", lost: "churned", wonBack: "winback_recovered" } as const;
export type RecoveryCounts = Record<keyof typeof RECOVERY_EVENTS | "failedPayments", number>;
/** Counts per period from event rows (every key present, 0 when none) + testimonial cancellations / failed payments. */
export function recoveryCounts(events: readonly { name: string; at: Date }[], extraLost: readonly Date[], failedPaymentsNow: number, period: Period, now: Date): RecoveryCounts {
  const from = periodStart(period, now)?.getTime() ?? -Infinity;
  const n = (name: string) => events.filter((e) => e.name === name && e.at.getTime() >= from).length;
  return { recovered: n(RECOVERY_EVENTS.recovered), lost: n(RECOVERY_EVENTS.lost) + extraLost.filter((d) => d.getTime() >= from).length, wonBack: n(RECOVERY_EVENTS.wonBack) + n("payment_recovered"), failedPayments: failedPaymentsNow };
}

// ---- system health grid -----------------------------------------------------------------------------------------
export type HealthRow = { key: SystemKey; label: string; stage: string; enabled: boolean; health: SystemHealth; lastRunAt: string | null; lastOutputAt: string | null; outputs: number; runs: number; lastError: string | null; alertedAt: string | null };
export function healthGrid(flags: ReadonlyMap<string, boolean>, beats: ReadonlyMap<string, SystemBeat>, now: Date): HealthRow[] {
  return GROWTH_SYSTEMS.map((s) => {
    const enabled = flags.get(`sys_${s.key}`) ?? false;
    const b = beats.get(s.key) ?? null;
    return { key: s.key, label: s.label, stage: s.stage, enabled, health: systemHealth(s, enabled, b, now), lastRunAt: b?.lastRunAt ?? null, lastOutputAt: b?.lastOutputAt ?? null, outputs: b?.outputs ?? 0, runs: b?.runs ?? 0, lastError: b?.lastError ?? null, alertedAt: b?.alertedAt ?? null };
  });
}

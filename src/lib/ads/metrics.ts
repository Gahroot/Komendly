// Pure SaaS metrics for the Website2ads admin. No I/O: callers pass rows + an explicit `now`.
import { planMonthlyCents } from "./billing-config";

const DAY_MS = 24 * 3600 * 1000;

/** Linear-interpolated percentile (p in 0..100). Returns null for empty input. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * (rank - lo);
}

export interface SubscriberRow {
  adsPlan: string;
  subscriptionStatus: string;
}

const MRR_STATUSES = new Set(["active", "past_due"]);

export function computeMrr(rows: readonly SubscriberRow[]): { mrrCents: number; activeSubscribers: number; arpuCents: number } {
  const active = rows.filter((r) => r.adsPlan !== "trial" && MRR_STATUSES.has(r.subscriptionStatus));
  const mrrCents = active.reduce((s, r) => s + planMonthlyCents(r.adsPlan), 0);
  return { mrrCents, activeSubscribers: active.length, arpuCents: active.length ? Math.round(mrrCents / active.length) : 0 };
}

/** Churned during the period / subscribers active at the period start. */
export function churnRate(activeAtStart: number, churnedInPeriod: number): number {
  return activeAtStart > 0 ? churnedInPeriod / activeAtStart : 0;
}

export interface FunnelEvent {
  name: string;
  workspaceId: string | null;
  createdAt: Date;
}

/** Monday 00:00 UTC of the week containing d, as YYYY-MM-DD. */
export function cohortWeek(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

export interface CohortRow {
  week: string;
  trials: number;
  converted: number;
  rate: number;
  matured: boolean; // the full conversion window has elapsed for every trial in the cohort
}

/** Trial -> paid conversion: first trial_started per workspace, converted if paid_converted within windowDays. */
export function trialConversionByCohort(events: readonly FunnelEvent[], now: Date, windowDays = 30): { cohorts: CohortRow[]; overall: number } {
  const trialAt = new Map<string, Date>();
  const paidAt = new Map<string, Date>();
  for (const e of events) {
    if (!e.workspaceId) continue;
    const target = e.name === "trial_started" ? trialAt : e.name === "paid_converted" ? paidAt : null;
    if (!target) continue;
    const prev = target.get(e.workspaceId);
    if (!prev || e.createdAt < prev) target.set(e.workspaceId, e.createdAt);
  }
  const byWeek = new Map<string, { trials: number; converted: number; latest: number }>();
  for (const [ws, t] of trialAt) {
    const week = cohortWeek(t);
    const row = byWeek.get(week) ?? { trials: 0, converted: 0, latest: 0 };
    row.trials += 1;
    row.latest = Math.max(row.latest, t.getTime());
    const p = paidAt.get(ws);
    if (p && p >= t && p.getTime() - t.getTime() <= windowDays * DAY_MS) row.converted += 1;
    byWeek.set(week, row);
  }
  const cohorts = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, r]) => ({
      week,
      trials: r.trials,
      converted: r.converted,
      rate: r.trials ? r.converted / r.trials : 0,
      matured: now.getTime() - r.latest >= windowDays * DAY_MS,
    }));
  const trials = cohorts.reduce((s, c) => s + c.trials, 0);
  const converted = cohorts.reduce((s, c) => s + c.converted, 0);
  return { cohorts, overall: trials ? converted / trials : 0 };
}

/** Time-to-first-ad seconds (firstAdAt - confirmedAt) for runs with both. */
export function timeToFirstAdSeconds(runs: readonly { confirmedAt: Date | null; firstAdAt: Date | null }[]): number[] {
  return runs.flatMap((r) => (r.confirmedAt && r.firstAdAt && r.firstAdAt >= r.confirmedAt ? [(r.firstAdAt.getTime() - r.confirmedAt.getTime()) / 1000] : []));
}

export function runsPerDay(dates: readonly Date[], now: Date, days: number): { date: string; runs: number }[] {
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(d.toISOString().slice(0, 10), (counts.get(d.toISOString().slice(0, 10)) ?? 0) + 1);
  const out: { date: string; runs: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    out.push({ date, runs: counts.get(date) ?? 0 });
  }
  return out;
}

/** QC pass rate among ads that reached a verdict. */
export function qcPassRate(statuses: readonly string[]): number | null {
  const decided = statuses.filter((s) => s === "ready" || s === "failed_qc");
  return decided.length ? decided.filter((s) => s === "ready").length / decided.length : null;
}

export function failureRate(statuses: readonly string[]): number | null {
  const terminal = statuses.filter((s) => ["completed", "partial", "failed"].includes(s));
  return terminal.length ? terminal.filter((s) => s === "failed").length / terminal.length : null;
}

/** Gross margin estimate: 1 - cost / revenue. costMicros in USD micros, revenue in cents. */
export function grossMargin(revenueCents: number, costMicros: number): number | null {
  if (revenueCents <= 0) return null;
  return 1 - costMicros / 1e6 / (revenueCents / 100);
}

/** Mean provider cost per ad in USD. */
export function averageCostPerAdUsd(costsMicros: readonly number[]): number | null {
  return costsMicros.length ? costsMicros.reduce((s, c) => s + c, 0) / costsMicros.length / 1e6 : null;
}

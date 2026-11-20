// Pure maths for /admin/ads/scoreboard (autopilot plan section 7): sign-ups and payments by acquisition channel by
// week, plus the checkpoint table. No I/O: scoreboard-queries.ts loads the rows (internal/test accounts already removed).
import type { FirstTouch } from "@/lib/analytics/first-touch";
import { classifyTouch, weekStart } from "./funnel";

export const SCORE_CHANNELS = ["meta", "kly", "community", "blog", "referral", "other", "direct"] as const;
export type ScoreChannel = (typeof SCORE_CHANNELS)[number];
export const SCORE_CHANNEL_LABEL: Record<ScoreChannel, string> = {
  meta: "Meta ads",
  kly: "Kly cold email",
  community: "Community (Reddit/Quora)",
  blog: "Blog",
  referral: "Referrals & partners",
  other: "Other",
  direct: "Direct / unknown",
};

const COMMUNITY_SOURCES = new Set(["reddit", "quora"]);
const COMMUNITY_MEDIUM = "offsite-authority";

/** Media Master community posts: utm_source reddit/quora, utm_medium offsite-authority, or a reddit/quora referrer. */
export function isCommunityTouch(t: FirstTouch | null | undefined): boolean {
  if (!t) return false;
  if (t.utm_medium?.toLowerCase() === COMMUNITY_MEDIUM) return true;
  if (t.utm_source && COMMUNITY_SOURCES.has(t.utm_source.toLowerCase())) return true;
  const host = t.referrer?.toLowerCase().replace(/^www\./, "") ?? "";
  return !t.utm_source && [...COMMUNITY_SOURCES].some((s) => host === `${s}.com` || host.endsWith(`.${s}.com`));
}

/**
 * Channel of one sign-up. DB links win over the cookie (a Kly lead or a claimed outbound gift is Kly even when the
 * first touch was lost; an AdsReferral row is a referral), then the first touch (funnel.ts classifyTouch).
 */
export function scoreChannel(x: { touch: FirstTouch | null; klyLead?: boolean; referral?: boolean }): ScoreChannel {
  if (x.klyLead) return "kly";
  if (x.referral) return "referral";
  const t = x.touch;
  const c = classifyTouch(t).channel;
  if (c === "meta_paid") return "meta";
  if (c === "kly_email") return "kly";
  if (isCommunityTouch(t)) return "community";
  if (c === "blog") return "blog";
  if (c === "ref_link" || c === "partner" || c === "gift") return "referral";
  if (c === "direct") return "direct";
  return "other"; // other UTM campaigns, autopilot systems, other referring sites
}

export type PaymentEventRow = { workspaceId: string; name: string; props: unknown; createdAt: Date };
export type Payment = { workspaceId: string; at: Date; amountCents: number; what: string };

const propsOf = (p: unknown) => (p && typeof p === "object" ? (p as Record<string, unknown>) : {});

/**
 * New-money payments from ads billing events: every `purchased` checkout, plus `paid_converted` (first paid
 * subscription invoice) only when that workspace has no subscription checkout `purchased` (trial conversions and
 * history from before `purchased` existed). Renewals are not new payments here. Oldest first.
 */
export function newPayments(events: readonly PaymentEventRow[]): Payment[] {
  const subCheckout = new Set(events.filter((e) => e.name === "purchased" && propsOf(e.props).mode === "subscription").map((e) => e.workspaceId));
  return events
    .filter((e) => e.name === "purchased" || (e.name === "paid_converted" && !subCheckout.has(e.workspaceId)))
    .map((e) => {
      const p = propsOf(e.props);
      return { workspaceId: e.workspaceId, at: e.createdAt, amountCents: typeof p.amountCents === "number" ? p.amountCents : 0, what: String(p.key ?? p.plan ?? p.kind ?? e.name) };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export type ScoreSignup = { workspaceId: string; at: Date; channel: ScoreChannel };
type Counts = Record<ScoreChannel, number>;
const zero = (): Counts => Object.fromEntries(SCORE_CHANNELS.map((c) => [c, 0])) as Counts;

export type ScoreWeek = { week: string; signups: Counts; payments: Counts; revenueCents: number; signupTotal: number; paymentTotal: number };
export type Scoreboard = {
  weeks: ScoreWeek[];
  totals: { signups: Counts; payments: Counts; payers: Counts; revenueCents: Counts };
};

/** Mondays (UTC, YYYY-MM-DD) of the `n` weeks ending with the week of `now`, oldest first. */
export function lastWeeks(n: number, now: Date): string[] {
  const end = new Date(`${weekStart(now)}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 7 * 86400000).toISOString().slice(0, 10));
}

/**
 * Sign-ups and payments by channel for each week in `weeks` (payment channel = the paying workspace's sign-up channel,
 * "direct" when we never saw its sign-up). Totals cover every row passed in, not just the shown weeks.
 */
export function buildScoreboard(signups: readonly ScoreSignup[], payments: readonly Payment[], weeks: readonly string[]): Scoreboard {
  const channelOf = new Map(signups.map((s) => [s.workspaceId, s.channel]));
  const rows = new Map<string, ScoreWeek>(weeks.map((w) => [w, { week: w, signups: zero(), payments: zero(), revenueCents: 0, signupTotal: 0, paymentTotal: 0 }]));
  const totals = { signups: zero(), payments: zero(), payers: zero(), revenueCents: zero() };
  for (const s of signups) {
    totals.signups[s.channel] += 1;
    const r = rows.get(weekStart(s.at));
    if (r) { r.signups[s.channel] += 1; r.signupTotal += 1; }
  }
  const payers = new Set<string>();
  for (const p of payments) {
    const ch = channelOf.get(p.workspaceId) ?? "direct";
    totals.payments[ch] += 1;
    totals.revenueCents[ch] += p.amountCents;
    if (!payers.has(p.workspaceId)) { payers.add(p.workspaceId); totals.payers[ch] += 1; }
    const r = rows.get(weekStart(p.at));
    if (r) { r.payments[ch] += 1; r.paymentTotal += 1; r.revenueCents += p.amountCents; }
  }
  return { weeks: [...rows.values()], totals };
}

/** Live inputs for the section 7 checkpoints; null = no data source yet. */
export type CheckpointFacts = {
  freePackWorkspaces: number;
  freePackPaid: number;
  verifiedLeadsAvailable: number | null;
  emailsPerDay: number | null;
  signupsLast7d: number;
  channelsLast7d: number;
  payingCustomers: number;
  customersWithAdsLive: number | null;
};

export type CheckpointRow = { key: string; label: string; plan: string; live: string; dec15: string; jan31: string; met: { dec15: boolean; jan31: boolean } | null };

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

/** Section 7 table: the plan's "now" figure, today's live value and the 15 Dec / 31 Jan targets (met = live reaches it). */
export function checkpointRows(f: CheckpointFacts): CheckpointRow[] {
  const atLeast = (v: number | null, dec: number, jan: number) => (v === null ? null : { dec15: v >= dec, jan31: v >= jan });
  const rate = f.freePackWorkspaces > 0 ? f.freePackPaid / f.freePackWorkspaces : null;
  const n = (v: number | null, digits = 0) => (v === null ? "no data" : v.toFixed(digits));
  return [
    { key: "free_to_paid", label: "Free pack to payment", plan: "0 of ~29", live: `${f.freePackPaid} of ${f.freePackWorkspaces} (${pct(f.freePackPaid, f.freePackWorkspaces)})`, dec15: "first payment", jan31: "3% or better", met: { dec15: f.freePackPaid >= 1, jan31: rate !== null && rate >= 0.03 } },
    { key: "verified_leads", label: "Verified leads available", plan: "538", live: n(f.verifiedLeadsAvailable), dec15: "5,000", jan31: "20,000", met: atLeast(f.verifiedLeadsAvailable, 5000, 20000) },
    { key: "emails_per_day", label: "Emails sent per day (7-day avg)", plan: "~20", live: n(f.emailsPerDay, 1), dec15: "300", jan31: "1,500+", met: atLeast(f.emailsPerDay, 300, 1500) },
    { key: "signups_week", label: "Sign-ups per week, all channels (last 7 days)", plan: "~25", live: String(f.signupsLast7d), dec15: "50", jan31: "150", met: atLeast(f.signupsLast7d, 50, 150) },
    { key: "channels", label: "Channels producing sign-ups (last 7 days, excl. direct)", plan: "1", live: String(f.channelsLast7d), dec15: "3", jan31: "5", met: atLeast(f.channelsLast7d, 3, 5) },
    { key: "paying", label: "Paying customers, total", plan: "0", live: String(f.payingCustomers), dec15: "1", jan31: "10", met: atLeast(f.payingCustomers, 1, 10) },
    { key: "ads_live", label: "Customers with ads live", plan: "0", live: n(f.customersWithAdsLive), dec15: "0", jan31: "8", met: atLeast(f.customersWithAdsLive, 0, 8) },
  ];
}

/** Non-direct channels with at least one sign-up at/after `since`. */
export function channelsProducing(signups: readonly ScoreSignup[], since: Date): number {
  return new Set(signups.filter((s) => s.at >= since && s.channel !== "direct").map((s) => s.channel)).size;
}

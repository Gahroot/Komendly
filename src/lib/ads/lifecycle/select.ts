// Lifecycle email schedule: which email (if any) a user is due right now. Pure; shared by the
// engine loop (sends) and /admin/ads/emails (dry-run view). No package imports (engine imports it).
import { LAUNCH_QUARTER } from "../billing-config";

export const FRESH_KINDS = ["fresh_m1", "fresh_m2", "fresh_m3", "fresh_m4", "fresh_m5", "fresh_m6"] as const;
export type FreshKind = (typeof FRESH_KINDS)[number];
export const LIFECYCLE_KINDS = [
  "verify_nudge", "ads_ready",
  // Personal plain-text note from Nolan, FOUNDER_NOTE.delayMs after ads_ready actually went out (once per user).
  "founder_note",
  // Signed up but stuck before the free ads: second code reminder; verified but never pasted a website.
  "verify_nudge_2", "start_nudge_1h", "start_nudge_1d", "start_nudge_3d", "how_to_run", "offer_24h", "last_chance", "day7_downsell",
  // Long tail for unpaid trial users.
  "day10_free_ads", "day14_tip", "day21_examples", "day30_checkin", ...FRESH_KINDS,
  // One-off announcement to users who signed up before FREE_ADS_WAYS_START (paid users included).
  "free_ads_ways",
  "refreshed_pack",
] as const;
export type LifecycleKind = (typeof LIFECYCLE_KINDS)[number];
/** Kinds the scheduler sends by itself (refreshed_pack is triggered by ops only). */
export type ScheduledKind = Exclude<LifecycleKind, "refreshed_pack">;

export interface LifecycleCandidate {
  userId: string;
  email: string;
  name: string | null;
  workspaceId: string;
  /** Created via the /ads sign-up (a `signed_up` AdsEvent exists). */
  adsSignup: boolean;
  signedUpAt: Date;
  emailVerifiedAt: Date | null;
  paid: boolean;
  unsubscribed: boolean;
  trialRunId: string | null;
  /** Any non-gift run was ever started in the workspace (even one that failed or is still running). */
  startedRun?: boolean;
  /** Run start refused the free trial (trial_blocked event: used domain / network / device...). */
  trialBlocked?: boolean;
  /** When the trial run finished (completed/partial). Starts the 72h Launch Quarter window. */
  trialCompletedAt: Date | null;
  /** Launch Quarter window start (3rd ready main ad of the first trial run, or its completion if earlier): same rule as
   *  getLaunchOfferReadyAt in ../launch-offer.ts. Missing = falls back to trialCompletedAt. */
  offerReadyAt?: Date | null;
  /** Ready FREE ads of the trial run (locked bonus ads excluded). */
  readyAdCount: number;
  sent: Array<{ kind: string; runId: string | null; at: Date }>;
}

export interface ScheduledEmail {
  kind: ScheduledKind;
  /** Send only inside [from, until): late ticks never send stale emails (e.g. "ends in 24h" after it ended). */
  from: Date;
  until: Date;
}

const H = 3_600_000;
const D = 24 * H;

export const VERIFY_KINDS = ["verify_nudge", "verify_nudge_2"] as const;
/** Emails that carry a fresh verification code (fixed copy, verify link). */
export function isVerifyKind(kind: string): boolean {
  return (VERIFY_KINDS as readonly string[]).includes(kind);
}
export const START_KINDS = ["start_nudge_1h", "start_nudge_1d", "start_nudge_3d"] as const;
export function isStartKind(kind: string): boolean {
  return (START_KINDS as readonly string[]).includes(kind);
}

export function isFreshKind(kind: string): kind is FreshKind {
  return (FRESH_KINDS as readonly string[]).includes(kind);
}

/** Long-tail windows, in days after the trial finished: [fromDay, fromDay + days). */
export const LONG_TAIL: ReadonlyArray<{ kind: ScheduledKind; day: number; days: number }> = [
  { kind: "day10_free_ads", day: 10, days: 2 },
  { kind: "day14_tip", day: 14, days: 2 },
  { kind: "day21_examples", day: 21, days: 2 },
  { kind: "day30_checkin", day: 30, days: 2 },
  // Monthly "Ozzy made you a new ad" (6 of them, then it stops). 3-day windows: the engine first makes the ad.
  ...FRESH_KINDS.map((kind, i) => ({ kind, day: 60 + 30 * i, days: 3 })),
];

/**
 * free_ads_ways (one-off): users who signed up before this instant get it once; later sign-ups get day10_free_ads.
 * Each user's send time is spread over SPREAD_H after the start (hash of the user id), so it trickles out over ~2 days.
 * Override with LIFECYCLE_FREE_ADS_WAYS_START (ISO) if the deploy lands much later.
 */
export const FREE_ADS_WAYS = { start: new Date("2026-11-10T00:00:00Z"), spreadHours: 48, openDays: 14 };
export function freeAdsWaysStart(env: string | undefined = typeof process !== "undefined" ? process.env.LIFECYCLE_FREE_ADS_WAYS_START : undefined): Date {
  const d = env ? new Date(env) : null;
  return d && Number.isFinite(d.getTime()) ? d : FREE_ADS_WAYS.start;
}
/** Deterministic 0..n-1 from a string (FNV-1a). */
export function spreadSlot(id: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h % n;
}
/**
 * Frequency cap shared by BOTH sequences (trial lifecycle + Studio drip): at most 1 lifecycle email per 24h per user.
 * Exempt: transactional emails (below) and the trial's real-deadline last_chance / ads-ready notice.
 */
export const MIN_GAP_MS = 24 * H;
/** Sends that never count toward (nor wait for) the 24h cap: verify codes, "your video is ready", invite reward. */
export const TRANSACTIONAL_KINDS: ReadonlySet<string> = new Set(["verify_nudge", "verify_nudge_2", "studio_ready", "studio_invite_reward"]);
/** founder_note: sent this long after ads_ready went out; not later than openMs after it (missed = never). */
export const FOUNDER_NOTE = { delayMs: 10 * 60_000, openMs: 20 * H, quietMs: 2 * H };
/** Kinds founder_note doesn't wait for (it follows ads_ready by design). */
const FOUNDER_IGNORES: ReadonlySet<string> = new Set(["ads_ready", "founder_note"]);

/** Last non-transactional lifecycle email (any sequence), ms epoch; 0 = none. */
export function lastCappedSendAt(sent: ReadonlyArray<{ kind: string; at: Date }>): number {
  return sent.reduce((m, s) => (TRANSACTIONAL_KINDS.has(s.kind) ? m : Math.max(m, s.at.getTime())), 0);
}

// Test / internal addresses never get lifecycle email: our own domain, Resend test sinks, e2e accounts, and
// LIFECYCLE_EXCLUDE (comma-separated emails, e.g. the owner's personal accounts).
const TEST_RE = /(^e2e[-+].*@|@komendly\.com$|@resend\.dev$|\.test$)/i;
export function isTestEmail(email: string, exclude: string | undefined = typeof process !== "undefined" ? process.env.LIFECYCLE_EXCLUDE : undefined): boolean {
  const e = email.trim().toLowerCase();
  if (TEST_RE.test(e)) return true;
  return (exclude ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).includes(e);
}

/** Why a user gets no lifecycle email at all (null = eligible). */
export function suppressedReason(c: LifecycleCandidate): "test_user" | "paid" | "unsubscribed" | null {
  if (isTestEmail(c.email)) return "test_user";
  if (c.paid) return "paid";
  if (c.unsubscribed) return "unsubscribed";
  return null;
}

/** Kinds a paid user may still get (everything else stops once they pay). */
const PAID_OK: ReadonlySet<string> = new Set(["free_ads_ways"]);

/** An ads user (not only a testimonials account that happens to own a workspace). */
function isAdsUser(c: LifecycleCandidate): boolean {
  return c.adsSignup || Boolean(c.trialRunId) || c.paid;
}

export function scheduleFor(c: LifecycleCandidate, start: Date = freeAdsWaysStart()): ScheduledEmail[] {
  const out: ScheduledEmail[] = [];
  const at = (base: Date, h: number) => new Date(base.getTime() + h * H);
  if (!c.emailVerifiedAt && c.adsSignup) {
    out.push({ kind: "verify_nudge", from: at(c.signedUpAt, 1), until: at(c.signedUpAt, 24) });
    out.push({ kind: "verify_nudge_2", from: at(c.signedUpAt, 24), until: at(c.signedUpAt, 72) });
  }
  // Verified but never started their free ads (and the trial wasn't refused): nudge from the verification time.
  const v = c.emailVerifiedAt;
  if (v && c.adsSignup && !c.paid && !c.startedRun && !c.trialBlocked && !c.trialRunId) {
    out.push({ kind: "start_nudge_1h", from: at(v, 1), until: at(v, 24) });
    out.push({ kind: "start_nudge_1d", from: at(v, 24), until: at(v, 48) });
    out.push({ kind: "start_nudge_3d", from: at(v, 72), until: at(v, 96) });
  }
  const t = c.trialCompletedAt;
  if (t && c.trialRunId) {
    const close = LAUNCH_QUARTER.windowHours;
    // Offer emails follow the Launch Quarter window (opens at the 3rd ready ad), not run completion.
    const w = offerWindowStart(c) ?? t;
    if (c.readyAdCount > 0) out.push({ kind: "ads_ready", from: t, until: at(t, 12) });
    // Only after ads_ready really went out (its send time, not the schedule).
    const readySent = c.sent.find((s) => s.kind === "ads_ready");
    if (c.readyAdCount > 0 && readySent) {
      const r = readySent.at.getTime();
      out.push({ kind: "founder_note", from: new Date(r + FOUNDER_NOTE.delayMs), until: new Date(r + FOUNDER_NOTE.openMs) });
    }
    out.push({ kind: "how_to_run", from: at(w, 24), until: at(w, close - 30) });
    out.push({ kind: "offer_24h", from: at(w, close - 24), until: at(w, close - 4) });
    out.push({ kind: "last_chance", from: at(w, close - 2), until: at(w, close) });
    out.push({ kind: "day7_downsell", from: at(t, 7 * 24), until: at(t, 8 * 24) });
    for (const l of LONG_TAIL) out.push({ kind: l.kind, from: at(t, l.day * 24), until: at(t, (l.day + l.days) * 24) });
  }
  if (c.signedUpAt < start && isAdsUser(c) && (c.emailVerifiedAt || c.paid)) {
    out.push({ kind: "free_ads_ways", from: new Date(start.getTime() + spreadSlot(c.userId, FREE_ADS_WAYS.spreadHours) * H), until: new Date(start.getTime() + FREE_ADS_WAYS.openDays * D) });
  }
  return out;
}

/** day10_free_ads and free_ads_ways carry the same news: whichever goes first replaces the other. */
const SAME_NEWS: Record<string, string> = { day10_free_ads: "free_ads_ways", free_ads_ways: "day10_free_ads" };

function alreadySent(c: LifecycleCandidate, kind: string): boolean {
  const twin = SAME_NEWS[kind];
  return c.sent.some((s) => s.kind === kind || (twin !== undefined && s.kind === twin));
}

/** Don't announce free_ads_ways while the 72h launch offer sequence is running (it waits until after). */
function inOfferSequence(c: LifecycleCandidate, now: Date): boolean {
  const t = offerWindowStart(c);
  return Boolean(t && c.trialRunId && now.getTime() >= t.getTime() && now.getTime() < t.getTime() + LAUNCH_QUARTER.windowHours * H);
}

/** When the Launch Quarter window opened for this candidate (null = no finished trial yet). */
export function offerWindowStart(c: Pick<LifecycleCandidate, "offerReadyAt" | "trialCompletedAt">): Date | null {
  return c.offerReadyAt ?? c.trialCompletedAt;
}

/** Why this user gets no email of `kind` (null = eligible). */
export function suppressedFor(c: LifecycleCandidate, kind: string): "test_user" | "paid" | "unsubscribed" | null {
  const why = suppressedReason(c);
  return why === "paid" && PAID_OK.has(kind) ? (c.unsubscribed ? "unsubscribed" : null) : why;
}

/** The one email to send now, or null. */
export function dueEmail(c: LifecycleCandidate, now: Date, start: Date = freeAdsWaysStart()): ScheduledEmail | null {
  const lastSent = lastCappedSendAt(c.sent);
  for (const s of scheduleFor(c, start)) {
    if (suppressedFor(c, s.kind) || alreadySent(c, s.kind) || now < s.from || now >= s.until) continue;
    if (s.kind === "free_ads_ways" && inOfferSequence(c, now)) continue;
    if (s.kind === "founder_note") {
      // Exempt from the 24h cap (it follows ads_ready), but never within quietMs of any other lifecycle email.
      const other = c.sent.reduce((m, x) => (TRANSACTIONAL_KINDS.has(x.kind) || FOUNDER_IGNORES.has(x.kind) ? m : Math.max(m, x.at.getTime())), 0);
      if (now.getTime() - other < FOUNDER_NOTE.quietMs) continue;
      return s;
    }
    if (s.kind !== "last_chance" && s.kind !== "ads_ready" && now.getTime() - lastSent < MIN_GAP_MS) continue;
    return s;
  }
  return null;
}

/** The next not-yet-sent email in the future (admin preview). */
export function nextEmail(c: LifecycleCandidate, now: Date, start: Date = freeAdsWaysStart()): ScheduledEmail | null {
  return scheduleFor(c, start).find((s) => !suppressedFor(c, s.kind) && !alreadySent(c, s.kind) && s.from > now) ?? null;
}

export type ScheduleStatus = "sent" | "due" | "upcoming" | "missed" | "suppressed";
/** Full per-user schedule with a status per kind (admin view). */
export function scheduleStatus(c: LifecycleCandidate, now: Date, start: Date = freeAdsWaysStart()): Array<ScheduledEmail & { status: ScheduleStatus; sentAt: Date | null }> {
  const due = dueEmail(c, now, start);
  return scheduleFor(c, start).map((s) => {
    const sent = c.sent.find((x) => x.kind === s.kind);
    const status: ScheduleStatus = sent ? "sent" : suppressedFor(c, s.kind) || alreadySent(c, s.kind) ? "suppressed" : due?.kind === s.kind ? "due" : s.from > now ? "upcoming" : now >= s.until ? "missed" : "upcoming";
    return { ...s, status, sentAt: sent?.at ?? null };
  });
}

/** refreshed_pack: one per run. */
export function refreshedPackAllowed(c: LifecycleCandidate, runId: string): boolean {
  return !suppressedReason(c) && !c.sent.some((s) => s.kind === "refreshed_pack" && s.runId === runId);
}

/** Kinds built around the user's own best ready ad (hero image at the top). */
export const BEST_AD_KINDS: ReadonlySet<LifecycleKind> = new Set(["ads_ready", "how_to_run", "offer_24h", "last_chance", "day7_downsell"]);

export interface RankableAd {
  index: number;
  kind: string;
  qcReport: unknown;
  qcAttempts: number;
  hasImage: boolean;
}

/** Ready static ads with an image, best first: QC passed, fewest failed checks, fewest QC attempts, then run order. Replaced ads are dropped. */
export function rankAdsForEmail<T extends RankableAd>(ads: readonly T[]): T[] {
  const qc = (a: T) => (a.qcReport && typeof a.qcReport === "object" ? (a.qcReport as Record<string, unknown>) : {});
  const failed = (a: T) => {
    const checks = qc(a).checks;
    return Array.isArray(checks) ? checks.filter((c) => c && typeof c === "object" && (c as Record<string, unknown>).pass === false).length : 0;
  };
  return ads
    .filter((a) => a.kind === "static" && a.hasImage && !qc(a).replacedBy)
    .map((a) => ({ a, pass: qc(a).pass === false ? 1 : 0, f: failed(a) }))
    .sort((x, y) => x.pass - y.pass || x.f - y.f || x.a.qcAttempts - y.a.qcAttempts || x.a.index - y.a.index)
    .map((x) => x.a);
}

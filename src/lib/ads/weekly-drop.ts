// Weekly Drop (Ad Department plan): every Monday ~9am (workspace time zone, else US Eastern) Ozzy makes 5 statics +
// 1 animated ad from the customer's brand (AdRun.kind = "weekly", 0 credits) and emails "Your new ads are ready".
// Pure, shared by the engine scheduler (engine/src/jobs/weekly.ts) and the web (dashboard card, runs list).
import { hasAdDepartment } from "./billing-config";
import type { Awareness } from "./contracts";

export const WEEKLY_KIND = "weekly";
export const WEEKLY_EMAIL_KIND = "weekly_drop";
export const WEEKLY_STARTED = "weekly_drop_started";
export const WEEKLY_STATICS = 5;
export const WEEKLY_MOTION = 1;
export const WEEKLY_RATIOS = ["4:5", "1:1", "9:16"] as const;
export const WEEKLY_DEFAULT_TZ = "America/New_York";
/** Reuse the latest extraction unless it is older than this (then the run re-extracts). */
export const WEEKLY_EXTRACTION_MAX_AGE_MS = 30 * 86_400_000;
export const WEEKLY_HOUR = 9;
export const WEEKLY_TEASER = "Every Monday Ozzy makes you fresh ads and a new video, steered by one sentence from you. Included with Ozzy Ad Department.";

/** Ad Department member (billing-config's hasAdDepartment) and not suspended. */
export function isAdDepartment(ws: { adsPlan: string; subscriptionStatus: string; suspendedAt?: Date | null }): boolean {
  return hasAdDepartment(ws) && !ws.suspendedAt;
}

export function isWeeklyRun(run: { kind?: string | null }): boolean {
  return run.kind === WEEKLY_KIND;
}

function validTz(tz: string | null | undefined): string {
  if (!tz) return WEEKLY_DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return WEEKLY_DEFAULT_TZ;
  }
}

/** Local calendar parts of `now` in `tz`: weekday 1 = Monday .. 7 = Sunday. */
export function localParts(now: Date, tz?: string | null): { y: number; m: number; d: number; weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: validTz(tz), year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), weekday: wd, hour: Number(get("hour")) };
}

/** ISO week key ("2026-W47") of `now` in the workspace time zone: the idempotency key (one drop per workspace per week). */
export function isoWeekKey(now: Date, tz?: string | null): string {
  const { y, m, d } = localParts(now, tz);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type WeeklyDecision = { due: true; week: string; reason: "first_drop" | "monday" } | { due: false; week: string; reason: "disabled" | "not_subscribed" | "already_this_week" | "before_monday_9am" | "before_drop_time" };

/**
 * Should this workspace get a drop now? First drop right after subscribing (counts as this week's); afterwards
 * from Monday 09:00 local on (a missed Monday catches up later in the same week), at most once per ISO week.
 * Autopilot may move the day/hour (dayOfWeek 1 = Monday .. 7 = Sunday); the default keeps the Monday 9am reason.
 */
export function weeklyDropDecision(i: { now: Date; tz?: string | null; enabled: boolean; subscribed: boolean; weeksDone: readonly string[]; dayOfWeek?: number; hour?: number }): WeeklyDecision {
  const week = isoWeekKey(i.now, i.tz);
  if (!i.enabled) return { due: false, week, reason: "disabled" };
  if (!i.subscribed) return { due: false, week, reason: "not_subscribed" };
  if (i.weeksDone.includes(week)) return { due: false, week, reason: "already_this_week" };
  if (i.weeksDone.length === 0) return { due: true, week, reason: "first_drop" };
  const { weekday, hour } = localParts(i.now, i.tz);
  const day = i.dayOfWeek ?? 1;
  const at = i.hour ?? WEEKLY_HOUR;
  if (weekday < day || (weekday === day && hour < at)) return { due: false, week, reason: day === 1 && at === WEEKLY_HOUR ? "before_monday_9am" : "before_drop_time" };
  return { due: true, week, reason: "monday" };
}

export function weeklyDropEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ADS_WEEKLY_DROP !== "0";
}

const MIXES: ReadonlyArray<Partial<Record<Awareness, number>>> = [
  { problem_aware: 2, solution_aware: 2, most_aware: 1 },
  { unaware: 1, problem_aware: 1, product_aware: 2, most_aware: 1 },
  { unaware: 2, solution_aware: 2, product_aware: 1 },
  { problem_aware: 1, solution_aware: 1, product_aware: 1, most_aware: 2 },
];

/** Awareness mix rotated by how many drops came before, so each week leans on different buyer moments. */
export function weeklyAwarenessMix(priorDrops: number): Partial<Record<Awareness, number>> {
  return MIXES[Math.abs(priorDrops) % MIXES.length] ?? { solution_aware: WEEKLY_STATICS };
}

/** Earlier weeks' headlines/angles (newest first, de-duplicated case-insensitively, capped) for the planner's do-not-repeat list. */
export function weeklyAvoidList(prior: ReadonlyArray<{ headline?: string | null; angle?: string | null }>, max = 40): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of prior) {
    const line = [a.angle?.trim(), a.headline?.trim()].filter(Boolean).join(" | ");
    const k = line.toLowerCase().replace(/\s+/g, " ");
    if (!line || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

/** "Weekly Drop · Nov 17" (date of the run, workspace time zone). */
export function weeklyDropTitle(createdAt: Date, tz?: string | null): string {
  return `Weekly Drop · ${createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: validTz(tz) })}`;
}

/** Fixed Ozzy-voice copy for the "your new ads are ready" email. */
export function weeklyDropEmailCopy(o: { firstName: string | null; brandName: string | null; ready: number; focus?: string | null; videoReady?: boolean }): { subject: string; preheader: string; paragraphs: string[]; ctaLabel: string } {
  const hi = o.firstName ? `Hi ${o.firstName},` : "Hi,";
  const n = o.ready === 1 ? "1 new ad" : `${o.ready} new ads`;
  const brand = o.brandName?.trim();
  const focus = o.focus?.trim();
  const made = o.videoReady ? `${n} and a new video` : n;
  return {
    subject: o.videoReady ? "Your new ads and video are ready" : "Your new ads are ready",
    preheader: `Ozzy made ${made}${brand ? ` for ${brand}` : ""} this week. Fresh angles, ready for Meta.`,
    paragraphs: [
      `${hi} it's Ozzy. Your Weekly Drop is in: ${made}${brand ? ` for ${brand}` : ""}, made from your brand with angles you haven't run yet.`,
      ...(focus ? [`This week's focus: ${focus}`] : []),
      ...(o.videoReady ? ["Your Monday video is waiting in Ozzy Studio. Ask him for changes any time."] : []),
      "Swap them in for whatever is getting tired, or test them side by side. Want a different focus next week? Change it on your dashboard in one sentence.",
    ],
    ctaLabel: "See this week's ads",
  };
}

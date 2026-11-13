// Ozzy Autopilot: the Weekly Drop, steered. Every week (default Monday 9am, workspace time zone) Ozzy makes fresh
// ads and, optionally, one short Studio video, steered by the member's one-sentence focus and upcoming US retail dates.
// Pure: shared by the engine (engine/src/jobs/weekly.ts, engine/src/jobs/autopilot-video.ts) and the web (card, API, MCP).
import { isAdDepartment, localParts, WEEKLY_DEFAULT_TZ, WEEKLY_HOUR } from "./weekly-drop";

export const AUTOPILOT_FOCUS_MAX = 200;
/**
 * Studio queue priority for the weekly video. Customer jobs start at 0 (trial) / 10-100 (paid); claim order adds at most
 * +300 for waiting and +60 for Scale/Agency, so -400 never overtakes a customer job of the same type: it runs on spare capacity.
 */
export const AUTOPILOT_VIDEO_PRIORITY = -400;
export const AUTOPILOT_VIDEO_TITLE = "Your Monday video";
export const AUTOPILOT_VIDEO_SECONDS = 15;
export const AUTOPILOT_VIDEO_RATIO = "9:16";
/** How many of the member's latest uploads the weekly video may use. */
export const AUTOPILOT_VIDEO_UPLOADS = 4;
export const AUTOPILOT_UPGRADE_HREF = "/pricing?utm_source=autopilot";
export const AUTOPILOT_PLAN_LINE = "Ozzy Autopilot: fresh ads + a new video every Monday";

export interface AutopilotSettings {
  enabled: boolean;
  focus: string | null;
  dayOfWeek: number;
  hour: number;
  timezone: string | null;
  includeVideo: boolean;
}

export const AUTOPILOT_DEFAULTS: AutopilotSettings = { enabled: true, focus: null, dayOfWeek: 1, hour: WEEKLY_HOUR, timezone: null, includeVideo: true };

/** A stored row (or none) -> settings with defaults and clamped values. */
export function autopilotSettings(row: Partial<AutopilotSettings> | null | undefined): AutopilotSettings {
  const day = row?.dayOfWeek;
  const hour = row?.hour;
  return {
    enabled: row?.enabled ?? AUTOPILOT_DEFAULTS.enabled,
    focus: cleanFocus(row?.focus ?? null),
    dayOfWeek: typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 7 ? day : AUTOPILOT_DEFAULTS.dayOfWeek,
    hour: typeof hour === "number" && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : AUTOPILOT_DEFAULTS.hour,
    timezone: row?.timezone ?? null,
    includeVideo: row?.includeVideo ?? AUTOPILOT_DEFAULTS.includeVideo,
  };
}

/** Autopilot is included with Ozzy Ad Department and Agency (live subscription, not suspended). */
export function autopilotEligible(ws: { adsPlan: string; subscriptionStatus: string; suspendedAt?: Date | null }): boolean {
  return isAdDepartment(ws);
}

/** Trim, collapse whitespace, cap length; empty -> null (no focus = Ozzy picks). */
export function cleanFocus(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, AUTOPILOT_FOCUS_MAX) : null;
}

export type AutopilotPatch = { enabled?: boolean; focus?: string | null; includeVideo?: boolean; dayOfWeek?: number; hour?: number };

/** Validate an untrusted patch (API, MCP). */
export function parseAutopilotPatch(body: unknown): { ok: true; patch: AutopilotPatch } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Send enabled and/or focus." };
  const b = body as Record<string, unknown>;
  const patch: AutopilotPatch = {};
  if ("enabled" in b) {
    if (typeof b.enabled !== "boolean") return { ok: false, error: "enabled must be true or false." };
    patch.enabled = b.enabled;
  }
  if ("includeVideo" in b) {
    if (typeof b.includeVideo !== "boolean") return { ok: false, error: "includeVideo must be true or false." };
    patch.includeVideo = b.includeVideo;
  }
  if ("focus" in b) {
    if (b.focus !== null && typeof b.focus !== "string") return { ok: false, error: "focus must be text." };
    if (typeof b.focus === "string" && b.focus.trim().length > AUTOPILOT_FOCUS_MAX) return { ok: false, error: `Keep the focus under ${AUTOPILOT_FOCUS_MAX} characters.` };
    patch.focus = cleanFocus(b.focus as string | null);
  }
  if ("dayOfWeek" in b) {
    if (typeof b.dayOfWeek !== "number" || !Number.isInteger(b.dayOfWeek) || b.dayOfWeek < 1 || b.dayOfWeek > 7) return { ok: false, error: "dayOfWeek must be 1 (Monday) to 7 (Sunday)." };
    patch.dayOfWeek = b.dayOfWeek;
  }
  if ("hour" in b) {
    if (typeof b.hour !== "number" || !Number.isInteger(b.hour) || b.hour < 0 || b.hour > 23) return { ok: false, error: "hour must be 0 to 23." };
    patch.hour = b.hour;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to change. Send enabled and/or focus." };
  return { ok: true, patch };
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** "Monday 9am" */
export function dropTimeLabel(dayOfWeek: number, hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${DAY_NAMES[dayOfWeek - 1] ?? "Monday"} ${h}${hour < 12 ? "am" : "pm"}`;
}

/** "Next drop: Monday 9am" (or "this week, any minute" when it's due and not made yet). */
export function nextDropLabel(o: { settings: AutopilotSettings; dueNow: boolean }): string {
  if (!o.settings.enabled) return "Autopilot is off";
  return o.dueNow ? "Next drop: on its way" : `Next drop: ${dropTimeLabel(o.settings.dayOfWeek, o.settings.hour)}`;
}

export interface RetailMoment {
  key: string;
  name: string;
  /** "YYYY-MM-DD" (local calendar date) */
  date: string;
  daysAway: number;
  hint: string;
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** n-th (1-based) weekday (0 = Sunday) of a month; n = -1 = last. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastWd = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return lastDay - ((lastWd - weekday + 7) % 7);
}
/** Gregorian Easter Sunday (anonymous algorithm). */
function easter(y: number): [number, number] {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return [month, ((h + l - 7 * m + 114) % 31) + 1];
}

function momentsOfYear(y: number): Array<Omit<RetailMoment, "daysAway">> {
  const tg = nthWeekday(y, 11, 4, 4);
  const bf = new Date(Date.UTC(y, 10, tg + 1));
  const sbs = new Date(Date.UTC(y, 10, tg + 2));
  const cm = new Date(Date.UTC(y, 10, tg + 4));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [em, ed] = easter(y);
  return [
    { key: "new_year", name: "New Year's Day", date: ymd(y, 1, 1), hint: "fresh starts, resolutions, new-year offers" },
    { key: "valentines", name: "Valentine's Day", date: ymd(y, 2, 14), hint: "gifts, treating someone you love, last-minute ideas" },
    { key: "st_patricks", name: "St. Patrick's Day", date: ymd(y, 3, 17), hint: "light, playful, a little luck" },
    { key: "easter", name: "Easter", date: ymd(y, em, ed), hint: "spring, family gatherings, baskets and gifts" },
    { key: "mothers_day", name: "Mother's Day", date: ymd(y, 5, nthWeekday(y, 5, 0, 2)), hint: "gifts for mom, thank-yous, order-in-time reminders" },
    { key: "memorial_day", name: "Memorial Day", date: ymd(y, 5, nthWeekday(y, 5, 1, -1)), hint: "long weekend, start of summer, holiday sales" },
    { key: "fathers_day", name: "Father's Day", date: ymd(y, 6, nthWeekday(y, 6, 0, 3)), hint: "gifts for dad, thank-yous" },
    { key: "july_4", name: "Fourth of July", date: ymd(y, 7, 4), hint: "summer, cookouts, holiday sales" },
    { key: "back_to_school", name: "Back to school", date: ymd(y, 8, 1), hint: "routines restart, getting ready, school-season offers" },
    { key: "labor_day", name: "Labor Day", date: ymd(y, 9, nthWeekday(y, 9, 1, 1)), hint: "long weekend, end of summer sales" },
    { key: "halloween", name: "Halloween", date: ymd(y, 10, 31), hint: "playful, spooky, seasonal treats" },
    { key: "thanksgiving", name: "Thanksgiving", date: ymd(y, 11, tg), hint: "gratitude, family, getting ready to host" },
    { key: "black_friday", name: "Black Friday", date: iso(bf), hint: "the year's biggest sale day: clear offer, urgency" },
    { key: "small_business_saturday", name: "Small Business Saturday", date: iso(sbs), hint: "shop small, support local" },
    { key: "cyber_monday", name: "Cyber Monday", date: iso(cm), hint: "online deals, last chance after the weekend" },
    { key: "christmas", name: "Christmas", date: ymd(y, 12, 25), hint: "gifts, order-in-time reminders, cozy and festive" },
    { key: "new_years_eve", name: "New Year's Eve", date: ymd(y, 12, 31), hint: "celebration, last offer of the year" },
  ];
}

/** US retail/holiday moments from today through `days` days ahead (local calendar in `tz`), soonest first. */
export function upcomingMoments(now: Date, tz?: string | null, days = 14): RetailMoment[] {
  const { y, m, d } = localParts(now, tz ?? WEEKLY_DEFAULT_TZ);
  const today = Date.UTC(y, m - 1, d);
  const out: RetailMoment[] = [];
  for (const year of [y, y + 1]) {
    for (const mo of momentsOfYear(year)) {
      const [yy, mm, dd] = mo.date.split("-").map(Number) as [number, number, number];
      const away = Math.round((Date.UTC(yy, mm - 1, dd) - today) / 86_400_000);
      if (away >= 0 && away <= days) out.push({ ...mo, daysAway: away });
    }
  }
  return out.sort((a, b) => a.daysAway - b.daysAway || a.key.localeCompare(b.key));
}

function whenText(n: number): string {
  return n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
}

/** Planner block: the member's focus + upcoming dates (the do-not-repeat list is appended separately). */
export function autopilotPlanPrompt(o: { focus: string | null; moments: readonly RetailMoment[] }): string {
  const parts: string[] = [];
  if (o.focus) parts.push(`THIS WEEK'S FOCUS (from the customer, follow it unless it asks for claims the brand facts don't support): ${o.focus}`);
  if (o.moments.length) {
    parts.push(
      `UPCOMING DATES (US): ${o.moments.map((m) => `${m.name} ${whenText(m.daysAway)} (${m.hint})`).join("; ")}. ` +
        "Where it fits the brand, tie one or two ads to the nearest date. Never invent discounts, sales or deadlines the brand facts don't state.",
    );
  }
  return parts.join("\n");
}

/** The user message for the weekly Studio video turn (Ozzy works without asking questions). */
export function autopilotVideoPrompt(o: { focus: string | null; brandName: string | null; moments: readonly RetailMoment[]; uploads: number }): string {
  const brand = o.brandName?.trim() || "my brand";
  const lines = [
    `Make my weekly ${AUTOPILOT_VIDEO_SECONDS}-second ${AUTOPILOT_VIDEO_RATIO} vertical video ad for ${brand}.`,
    o.focus ? `This week's focus: ${o.focus}` : "Pick the strongest angle for this week.",
  ];
  const next = o.moments[0];
  if (next) lines.push(`Coming up: ${next.name} ${whenText(next.daysAway)}. Use it if it fits, without inventing offers.`);
  lines.push(o.uploads > 0 ? "Use my latest uploads and my brand colors and logo." : "Use my brand colors and logo.");
  lines.push("Give it an upbeat music bed that fits the brand, and bold on-screen captions so it works muted too.");
  lines.push("Don't ask me questions: make your best version and deliver the finished video. I can ask for changes after.");
  return lines.join("\n");
}

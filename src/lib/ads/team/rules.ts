// Owner-facing rules + view model for Ozzy's team page (prd.md R1, R4, R7, A9). Pure and client-safe.
import {
  CAP_GUARD_RATIO, TEAM_ROLES, formatMoney, monthKey, parseMandateInput, projectMonthSpend,
  type LabeledNumber, type MandateInput, type TeamRole,
} from "./contracts";
import type { Readiness } from "../meta/readiness";
import { TEAM_PLAN_KEYS } from "../billing-config";

/** Kinds written for the owner's own choices (shown as "You", not as a team role). */
export const OWNER_ACTION_KINDS = new Set(["authorized", "limit_changed", "owner_paused", "owner_resumed"]);

/** What each role will do next, shown when it has no real action yet (never invented activity). */
export function roleNextStep(role: TeamRole, leadEmail: string | null): string {
  switch (role) {
    case "director": return "Next: a plain-English report every week, once your ads are running.";
    case "strategy": return "Next: checks your business and picks the questions for your lead form before launch.";
    case "creative": return "Next: makes fresh ads from your website every week.";
    case "launch": return "Next: creates your lead form and campaign after you hire the team, then turns them on.";
    case "analyst": return "Next: reads your results once your ads have run for a day.";
    case "leads": return leadEmail ? `Next: emails each new lead to ${leadEmail} within a minute.` : "Next: emails each new lead to you within a minute.";
  }
}

export interface MandateView {
  status: string;
  state: string;
  stateReason: string | null;
  monthlyLimitMinor: number;
  currency: string;
  zips: string[];
  leadEmail: string;
  privacyUrl: string | null;
  adAccountId: string;
  pageId: string;
  authorizedAt: string;
  authorizationText: string;
  termsVersion: string;
  launchedAt: string | null;
  campaignId: string | null;
}

export interface TeamFeedItem { id: string; role: string; roleLabel: string; byOwner: boolean; kind: string; summary: string; outcome: string; at: string }
export interface TeamRosterItem { role: TeamRole; label: string; latest: TeamFeedItem | null; next: string }
export interface TeamLeadView { id: string; name: string | null; email: string | null; phone: string | null; zip: string | null; answers: Array<{ label: string; text: string }>; receivedAt: string }
export interface TeamNumbers {
  month: string;
  spend: LabeledNumber;
  projected: LabeledNumber;
  metaLeads: LabeledNumber;
  leadsReceived: LabeledNumber;
  costPerLead: LabeledNumber;
}
export interface TeamMetaView {
  access: "ok" | "upgrade" | "disabled";
  connected: boolean;
  selection: { adAccountId: string | null; pageId: string | null } | null;
  accounts:
    | { adAccounts: Array<{ id: string; name: string; currency?: string; readiness: Readiness }>; pages: Array<{ id: string; name: string }>; readiness: Readiness }
    | { error: string }
    | null;
  adAccountName: string | null;
  pageName: string | null;
  currency: string;
  /** Readiness of the chosen account + Page (null = unknown: nothing chosen or Meta unreachable). */
  readiness: Readiness | null;
  /**
   * Founding setup while Meta App Review is pending: the owner adds Komendly's Business as a partner and Komendly connects.
   * `offered` = show the path; `businessId` = Komendly's Business portfolio ID (null: we email it); `viaPartner` = Komendly's
   * token is connected; `requested` = the owner already said it's done.
   */
  partner: { offered: boolean; businessId: string | null; viaPartner: boolean; requested: boolean };
}
export interface TeamStatus {
  hired: boolean;
  isOwner: boolean;
  ownerEmail: string;
  businessName: string;
  meta: TeamMetaView;
  mandate: MandateView | null;
  numbers: TeamNumbers | null;
  statusLine: string;
  roster: TeamRosterItem[];
  feed: TeamFeedItem[];
  leads: TeamLeadView[];
}

export function feedItem(a: { id: string; role: string; kind: string; summary: string; outcome: string; createdAt: Date }): TeamFeedItem {
  const byOwner = OWNER_ACTION_KINDS.has(a.kind);
  const roleLabel = byOwner ? "You" : (TEAM_ROLES as Record<string, { label: string }>)[a.role]?.label ?? "Ozzy's team";
  return { id: a.id, role: a.role, roleLabel, byOwner, kind: a.kind, summary: a.summary, outcome: a.outcome, at: a.createdAt.toISOString() };
}

/** Team roster: each role with its latest real (non-owner) action, or what it will do next. */
export function buildRoster(latest: Partial<Record<TeamRole, TeamFeedItem>>, leadEmail: string | null): TeamRosterItem[] {
  return (Object.keys(TEAM_ROLES) as TeamRole[]).map((role) => ({ role, label: TEAM_ROLES[role].label, latest: latest[role] ?? null, next: roleNextStep(role, leadEmail) }));
}

/** First day of the month and the day count for a YYYY-MM key. */
function monthBounds(key: string): { first: string; days: number } {
  const [y, m] = key.split("-").map(Number);
  return { first: `${key}-01`, days: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

export function monthStartDay(now: Date, timeZone?: string): string {
  return monthBounds(monthKey(now, timeZone)).first;
}

/**
 * Honest month numbers (prd.md R4): spend and Meta-reported leads are measured from AdPerformanceDay, received leads from
 * our webhook, projected spend is estimated. No rows yet = unknown, never zero-filled.
 */
export function teamNumbers(o: {
  perfRows: Array<{ spendMinor: number; leads: number }>;
  leadsReceived: number;
  now: Date;
  timeZone?: string;
  monthlyLimitMinor: number;
}): TeamNumbers {
  const key = monthKey(o.now, o.timeZone);
  const { days } = monthBounds(key);
  const dayOfMonth = Number(new Intl.DateTimeFormat("en-CA", { timeZone: o.timeZone ?? "America/New_York", day: "2-digit" }).format(o.now));
  const has = o.perfRows.length > 0;
  const spend = o.perfRows.reduce((s, r) => s + r.spendMinor, 0);
  const metaLeads = o.perfRows.reduce((s, r) => s + r.leads, 0);
  const noData = "No results from Meta yet.";
  let projected: LabeledNumber = { value: null, certainty: "unknown", note: noData };
  if (has) {
    const p = projectMonthSpend(spend, dayOfMonth, days);
    projected = p.value !== null && p.value > o.monthlyLimitMinor
      ? { value: o.monthlyLimitMinor, certainty: "estimated", note: "at the current pace; the team stops at your limit" }
      : p;
  }
  return {
    month: key,
    spend: has ? { value: spend, certainty: "measured", note: "from Meta" } : { value: null, certainty: "unknown", note: noData },
    projected,
    metaLeads: has ? { value: metaLeads, certainty: "measured", note: "Meta reports" } : { value: null, certainty: "unknown", note: noData },
    leadsReceived: { value: o.leadsReceived, certainty: "measured", note: "received by Komendly" },
    costPerLead: has && o.leadsReceived > 0
      ? { value: Math.round(spend / o.leadsReceived), certainty: "measured", note: "spend ÷ leads received" }
      : { value: null, certainty: "unknown", note: has ? "No leads yet this month." : noData },
  };
}

/** Ozzy's one-line status for the owner, from the stored mandate (status = owner intent, state = what the engine did). */
export function statusLine(m: Pick<MandateView, "status" | "state" | "stateReason" | "launchedAt"> | null, hired: boolean): string {
  if (!hired) return "Hire the team and Ozzy takes it from here.";
  if (!m) return "Three short steps and the team gets to work.";
  if (m.status === "paused" && m.state !== "paused") return "Pausing your ads now. This takes a few minutes.";
  if (m.status === "stopped" && m.state !== "stopped") return "Stopping your ads now. This takes a few minutes.";
  if (m.status === "active" && (m.state === "paused" || m.state === "stopped")) return "Turning your ads back on. This takes a few minutes.";
  switch (m.state) {
    case "pending": return "You're all set. The team is building your lead form and campaign; you'll see each step here as it happens.";
    case "live": return m.stateReason ?? "Your ads are running. The team checks them every day.";
    case "capped": return m.stateReason ?? "This month's ad budget is used up. Your ads start again on the 1st.";
    case "blocked": return m.stateReason ?? "The team is waiting on something from you before it can launch.";
    case "needs_reconnect": return m.stateReason ?? "Meta is disconnected. Reconnect it so the team can keep working.";
    case "paused": return m.stateReason ?? "Your ads are paused.";
    case "stopped": return m.stateReason ?? "The team has stopped and your ads are paused.";
    default: return m.stateReason ?? "The team is working on it.";
  }
}

// ---------- owner changes (PATCH) ----------
export interface CurrentMandate { status: string; monthlyLimitMinor: number; currency: string; zips: string[]; leadEmail: string; privacyUrl: string | null }
export type OwnerChange =
  | { ok: false; status: number; code: string; error: string }
  | { ok: true; noop: true }
  | {
      ok: true;
      noop?: false;
      update: Partial<Pick<CurrentMandate, "status" | "monthlyLimitMinor" | "zips" | "leadEmail" | "privacyUrl">>;
      /** New values to agree to: the server re-stores the authorization text with them. */
      reauthorize: MandateInput | null;
      actions: Array<{ kind: "owner_paused" | "owner_resumed" | "limit_changed"; summary: string }>;
      pauseReason: string | null;
    };

const sameList = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Owner action on an existing mandate. Pausing is always allowed and immediate. Resuming and any change to the limit,
 * ZIPs or lead email need the authorization tick again (agreed: true). Lowering the limit takes effect at once; below
 * this month's spend it also pauses now (the engine resumes next month).
 */
export function planOwnerChange(cur: CurrentMandate, body: unknown, ctx: { monthToDateMinor: number }): OwnerChange {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const action = b.action;
  if (action === "pause") {
    if (cur.status !== "active") return { ok: true, noop: true };
    return { ok: true, update: { status: "paused" }, reauthorize: null, actions: [{ kind: "owner_paused", summary: "You paused your ads." }], pauseReason: "owner_paused" };
  }
  if (action !== "resume" && action !== "update") return { ok: false, status: 400, code: "invalid", error: "Unknown action." };
  if (action === "resume" && cur.status === "active") return { ok: false, status: 409, code: "already_active", error: "Your ads are already on." };
  const merged: Record<string, unknown> = {
    monthlyLimit: cur.monthlyLimitMinor / 100, zips: cur.zips, leadEmail: cur.leadEmail, privacyUrl: cur.privacyUrl ?? "", agreed: b.agreed,
  };
  for (const k of ["monthlyLimit", "zips", "leadEmail", "privacyUrl"] as const) if (k in b) merged[k] = b[k] === null ? "" : b[k];
  const parsed = parseMandateInput(merged);
  if (!parsed.ok) return { ok: false, status: 400, code: "invalid", error: parsed.error };
  const v = parsed.value;
  const actions: Array<{ kind: "owner_paused" | "owner_resumed" | "limit_changed"; summary: string }> = [];
  const update: Partial<CurrentMandate> = {};
  const money = (m: number) => formatMoney(m, cur.currency);
  if (v.monthlyLimitMinor !== cur.monthlyLimitMinor) {
    update.monthlyLimitMinor = v.monthlyLimitMinor;
    actions.push({ kind: "limit_changed", summary: `You ${v.monthlyLimitMinor < cur.monthlyLimitMinor ? "lowered" : "raised"} your monthly ad budget limit from ${money(cur.monthlyLimitMinor)} to ${money(v.monthlyLimitMinor)}.` });
  }
  if (!sameList(v.zips, cur.zips)) {
    update.zips = v.zips;
    actions.push({ kind: "limit_changed", summary: `You changed your service area to ${v.zips.length} ZIP code${v.zips.length === 1 ? "" : "s"}.` });
  }
  if (v.leadEmail !== cur.leadEmail) {
    update.leadEmail = v.leadEmail;
    actions.push({ kind: "limit_changed", summary: `You changed where leads are sent to ${v.leadEmail}.` });
  }
  if (v.privacyUrl !== cur.privacyUrl) update.privacyUrl = v.privacyUrl;
  if (action === "resume") {
    update.status = "active";
    actions.push({ kind: "owner_resumed", summary: `You turned your ads back on, with a limit of ${money(v.monthlyLimitMinor)} a month.` });
  } else if (!Object.keys(update).length) {
    return { ok: true, noop: true };
  }
  const runningAfter = (update.status ?? cur.status) === "active";
  const belowSpend = runningAfter && v.monthlyLimitMinor < cur.monthlyLimitMinor && ctx.monthToDateMinor >= v.monthlyLimitMinor * CAP_GUARD_RATIO;
  return { ok: true, update, reauthorize: v, actions, pauseReason: belowSpend ? "limit_below_spend" : null };
}

/** Ad account name the owner agreed to, read back from a stored authorization text (it never changes on a mandate). */
export function adAccountNameFromText(text: string): string | null {
  return /in my ad account "(.*)"\. Ad spend/.exec(text)?.[1] ?? null;
}

/** Checkouts that hire the team land on /ads/team (Growth Autopilot or Agency). Ad Department (DIY) goes back to billing. */
export function hiresTeam(kind: string, planKey: string | null | undefined): boolean {
  return (kind === "plan" || kind === "offer") && (TEAM_PLAN_KEYS as readonly string[]).includes(planKey ?? "");
}

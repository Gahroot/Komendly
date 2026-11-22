// Weekly Ozzy report for "Hire Ozzy's AI marketing team" (prd.md R4, R5, A9). Pure TS (no Next/Prisma/Node-only imports):
// imported by the engine (engine/src/growth/meta-results.ts) and usable by the web. Built only from stored data:
// AdPerformanceDay (Meta-reported, measured), MetaLead (webhook-received, measured) and MarketingAction (real work).
// Deterministic text first; any AI polish happens in the engine (Codex only) and must keep every number unchanged.
import type { ResultsReport } from "../results/insights";
import {
  formatMoney, improvementClaim, projectMonthSpend, TEAM_ROLES, type LabeledNumber, type MandateState, type TeamRole,
} from "./contracts";

export interface ReportWindow {
  /** ISO week reported ("2026-W47"): the last complete Monday-Sunday week before `today`. */
  week: string;
  weekStart: string; // YYYY-MM-DD inclusive
  weekEnd: string;
  prevStart: string; // the week before (for the improvement claim)
  prevEnd: string;
  monthStart: string; // first day of today's month
  today: string;
  dayOfMonth: number;
  daysInMonth: number;
}

const DAY_MS = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** ISO week key of a calendar date (YYYY-MM-DD). */
export function isoWeekOfDay(day: string): string {
  const date = new Date(utc(day));
  const wd = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - wd);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const n = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(n).padStart(2, "0")}`;
}

/** Report window from today's local calendar date (YYYY-MM-DD in the workspace time zone). */
export function reportWindow(today: string): ReportWindow {
  const t = utc(today);
  const wd = new Date(t).getUTCDay() || 7; // 1 = Monday
  const thisMonday = t - (wd - 1) * DAY_MS;
  const weekStart = thisMonday - 7 * DAY_MS;
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  return {
    week: isoWeekOfDay(iso(weekStart)),
    weekStart: iso(weekStart),
    weekEnd: iso(thisMonday - DAY_MS),
    prevStart: iso(weekStart - 7 * DAY_MS),
    prevEnd: iso(weekStart - DAY_MS),
    monthStart: iso(Date.UTC(y, m - 1, 1)),
    today,
    dayOfMonth: d,
    daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate(),
  };
}

export interface PerfDay { metaAdId: string; adId?: string | null; day: string; spendMinor: number; impressions?: number; clicks?: number; leads: number }
export interface ActionRow { role: string; kind: string; summary: string; outcome: string; day: string }

export interface TeamReportInput {
  window: ReportWindow;
  mandate: { state: MandateState | string; stateReason?: string | null; monthlyLimitMinor: number; currency: string; launchedAt?: Date | null };
  /** AdPerformanceDay rows covering at least prevStart..today. */
  days: readonly PerfDay[];
  /** Local calendar day (YYYY-MM-DD) each webhook lead was received. */
  leadDays: readonly string[];
  /** MarketingAction rows with their local calendar day. */
  actions: readonly ActionRow[];
}

export interface TeamRoleWork { role: TeamRole; label: string; lines: string[] }

export interface TeamReport {
  week: string;
  since: string;
  until: string;
  currency: string;
  limitMinor: number;
  spendWeek: LabeledNumber;
  spendMonth: LabeledNumber;
  projectedMonth: LabeledNumber;
  leadsReceived: LabeledNumber;
  leadsMeta: LabeledNumber;
  /** One line explaining why Meta-reported and received leads differ; null when they match or Meta has no data. */
  leadMismatch: string | null;
  costPerLead: LabeledNumber;
  claim: string;
  did: TeamRoleWork[];
  next: string[];
  needsOwner: string[];
}

export const LEAD_MISMATCH_REASON =
  "The two counts can differ because Meta counts a lead when the form is sent, while we count it when Meta delivers it to us, so late deliveries, leads Meta later removes as spam, and the week's start and end can move a few.";

const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
const sum = (rows: readonly PerfDay[], k: "spendMinor" | "leads") => rows.reduce((s, r) => s + (r[k] || 0), 0);
const MAX_LINES_PER_ROLE = 6;

function monthName(today: string, offset: number): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

/** Real actions of the week grouped by role (TEAM_ROLES order). Repeats collapse; results checks become one line. */
export function groupActions(actions: readonly ActionRow[], start: string, end: string): TeamRoleWork[] {
  const out: TeamRoleWork[] = [];
  for (const role of Object.keys(TEAM_ROLES) as TeamRole[]) {
    const mine = actions.filter((a) => a.role === role && a.outcome === "done" && inRange(a.day, start, end) && a.summary.trim());
    if (!mine.length) continue;
    const lines: string[] = [];
    const checks = new Set(mine.filter((a) => a.kind === "metrics_read").map((a) => a.day));
    if (checks.size) lines.push(`Checked your results on ${checks.size} ${checks.size === 1 ? "day" : "days"}.`);
    const counts = new Map<string, number>();
    for (const a of mine) if (a.kind !== "metrics_read") counts.set(a.summary.trim(), (counts.get(a.summary.trim()) ?? 0) + 1);
    for (const [s, n] of counts) lines.push(n > 1 ? `${s} (${n} times)` : s);
    const shown = lines.slice(0, MAX_LINES_PER_ROLE);
    if (lines.length > shown.length) shown.push(`And ${lines.length - shown.length} more.`);
    out.push({ role, label: TEAM_ROLES[role].label, lines: shown });
  }
  return out;
}

function nextSteps(state: string, today: string, reason: string | null | undefined): { next: string[]; needsOwner: string[] } {
  switch (state) {
    case "live":
      return { next: ["The team keeps checking results every day, pauses ads that waste money and brings in fresh ads each week."], needsOwner: [] };
    case "capped":
      return {
        next: [`This month's ad budget is used up, so your ads are paused. They resume automatically on ${monthName(today, 1)} 1. If you want ads to run before then, you can raise your limit on your team page.`],
        needsOwner: [],
      };
    case "paused":
      return { next: ["Your ads are paused. Press Resume on your team page when you want the team to start again."], needsOwner: [] };
    case "stopped":
      return { next: ["The team has stopped and your ads stay paused."], needsOwner: [] };
    case "needs_reconnect":
      return {
        next: ["Nothing changes in your ad account until Meta is reconnected. Your monthly limit still holds."],
        needsOwner: [reason?.trim() || "Meta is disconnected. Reconnect it on your team page so the team can keep working."],
      };
    case "blocked":
      return {
        next: ["The team launches as soon as the issue below is fixed. It checks again every 15 minutes."],
        needsOwner: [reason?.trim() || "Something in your Meta account needs attention. Open your team page to see what."],
      };
    default:
      return { next: ["The team is setting up your lead form and campaign. It goes live as soon as your Meta account is ready."], needsOwner: [] };
  }
}

/** The week's report. Pure and deterministic; every number is labelled measured / estimated / unknown. */
export function buildTeamReport(i: TeamReportInput): TeamReport {
  const w = i.window;
  const cur = i.mandate.currency || "USD";
  const week = i.days.filter((d) => inRange(d.day, w.weekStart, w.weekEnd));
  const prev = i.days.filter((d) => inRange(d.day, w.prevStart, w.prevEnd));
  const month = i.days.filter((d) => inRange(d.day, w.monthStart, w.today));
  const noData = { value: null, certainty: "unknown" as const, note: "no results stored yet" };

  const spendWeek: LabeledNumber = week.length ? { value: sum(week, "spendMinor"), certainty: "measured" } : noData;
  const spendMonth: LabeledNumber = month.length ? { value: sum(month, "spendMinor"), certainty: "measured" } : noData;
  const projectedMonth: LabeledNumber = spendMonth.value !== null ? projectMonthSpend(spendMonth.value, w.dayOfMonth, w.daysInMonth) : { value: null, certainty: "unknown" };
  const received = i.leadDays.filter((d) => inRange(d, w.weekStart, w.weekEnd)).length;
  const leadsReceived: LabeledNumber = { value: received, certainty: "measured", note: "received by our webhook" };
  const meta = week.length ? sum(week, "leads") : null;
  const leadsMeta: LabeledNumber = meta === null ? noData : { value: meta, certainty: "measured", note: "Meta reports" };
  const leadMismatch = meta !== null && meta !== received ? LEAD_MISMATCH_REASON : null;
  const costPerLead: LabeledNumber = spendWeek.value !== null && meta
    ? { value: Math.round(spendWeek.value / meta), certainty: "measured", note: "spend / Meta-reported leads" }
    : { value: null, certainty: "unknown", note: spendWeek.value === null ? "no results stored yet" : "no leads yet" };
  const claim = improvementClaim({ spendMinor: sum(prev, "spendMinor"), leads: sum(prev, "leads") }, { spendMinor: sum(week, "spendMinor"), leads: sum(week, "leads") }, cur);
  const steps = nextSteps(String(i.mandate.state), w.today, i.mandate.stateReason);
  return {
    week: w.week, since: w.weekStart, until: w.weekEnd, currency: cur, limitMinor: i.mandate.monthlyLimitMinor,
    spendWeek, spendMonth, projectedMonth, leadsReceived, leadsMeta, leadMismatch, costPerLead, claim,
    did: groupActions(i.actions, w.weekStart, w.weekEnd),
    next: steps.next,
    needsOwner: steps.needsOwner,
  };
}

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const leadsWord = (n: number) => `${n} ${n === 1 ? "lead" : "leads"}`;

/** Plain-English email block (deterministic). Labels are spelled out next to each number. */
export function teamReportParagraphs(r: TeamReport): string[] {
  const money = (m: number) => formatMoney(m, r.currency);
  const limit = money(r.limitMinor);
  const out: string[] = [];
  const span = `${shortDay(r.since)} to ${shortDay(r.until)}`;
  let spend = r.spendWeek.value !== null
    ? `Your team's week (${span}): ${money(r.spendWeek.value)} spent on your ads (measured).`
    : `Your team's week (${span}): ad spend unknown, no results stored yet.`;
  if (r.spendMonth.value !== null) {
    spend += ` This month so far: ${money(r.spendMonth.value)} of your ${limit} monthly limit (measured).`;
    if (r.projectedMonth.value !== null) {
      spend += r.projectedMonth.value >= r.limitMinor
        ? ` At the current pace the month would pass your limit (estimated), so spending stops at ${limit}.`
        : ` At the current pace about ${money(r.projectedMonth.value)} by month end (estimated).`;
    }
  } else {
    spend += ` Your monthly limit is ${limit}.`;
  }
  out.push(spend);

  let leads = `Leads: ${leadsWord(r.leadsReceived.value ?? 0)} received and emailed to you (measured).`;
  if (r.leadMismatch && r.leadsMeta.value !== null) leads += ` Meta reports ${leadsWord(r.leadsMeta.value)} for the same week (measured). ${r.leadMismatch}`;
  if (r.costPerLead.value !== null && r.spendWeek.value !== null && r.leadsMeta.value) {
    leads += ` Cost per lead: ${money(r.costPerLead.value)} (measured: ${money(r.spendWeek.value)} for ${leadsWord(r.leadsMeta.value)}${r.leadMismatch ? " reported by Meta" : ""}).`;
  } else {
    leads += ` Cost per lead: unknown (${r.costPerLead.note ?? "no data yet"}).`;
  }
  out.push(leads);
  out.push(r.claim);

  if (r.did.length) out.push(`What the team did this week: ${r.did.map((g) => `${g.label}: ${g.lines.join(" ")}`).join(" ")}`);
  else out.push("What the team did this week: no team actions were recorded.");
  out.push(`What's next: ${r.next.join(" ")}`);
  if (r.needsOwner.length) out.push(`Needs you: ${r.needsOwner.join(" ")}`);
  return out;
}

/** Facts for an AI reviewer / polish prompt: the report JSON and the exact deterministic text. */
export function teamReportFacts(r: TeamReport): string {
  return [
    "Numbers come from Komendly's stored data: AdPerformanceDay (Meta-reported spend and leads, measured), MetaLead (leads received by our webhook, measured) and MarketingAction (work the team really did). Projected month-end spend is an estimate.",
    `REPORT JSON: ${JSON.stringify(r)}`,
    `EXACT TEXT: ${teamReportParagraphs(r).join(" | ")}`,
  ].join("\n");
}

/** Every number-like token in a text ($1,234.50, 12%, 2026, 7). Used to prove AI wording kept the numbers. */
export function numberTokens(text: string): string[] {
  return (text.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? []).map((t) => t.replace(/,(?=\d{3}\b)/g, "")).sort();
}

/** AI wording is acceptable only when it has exactly the same numbers as the deterministic text (none added, none dropped). */
export function sameNumbers(fixed: readonly string[], polished: readonly string[]): boolean {
  const a = numberTokens(fixed.join("\n"));
  const b = numberTokens(polished.join("\n"));
  return a.length === b.length && a.every((t, k) => t === b[k]);
}

/** Dashboard-card compatible report (src/components/ads/results-summary.tsx) from stored rows; null without impressions. */
export function teamResultsReport(o: { window: ReportWindow; currency: string; days: readonly PerfDay[]; labels: ReadonlyMap<string, string> }): ResultsReport | null {
  const ads = new Map<string, { key: string; label: string; spend: number; impressions: number; clicks: number; results: number }>();
  for (const d of o.days) {
    if (!inRange(d.day, o.window.weekStart, o.window.weekEnd)) continue;
    const key = d.adId || d.metaAdId;
    const a = ads.get(key) ?? { key, label: o.labels.get(key) || "Untitled ad", spend: 0, impressions: 0, clicks: 0, results: 0 };
    a.spend += d.spendMinor / 100; a.impressions += d.impressions ?? 0; a.clicks += d.clicks ?? 0; a.results += d.leads;
    ads.set(key, a);
  }
  const list = [...ads.values()].filter((a) => a.impressions > 0).sort((a, b) => b.spend - a.spend);
  if (!list.length) return null;
  const totals = list.reduce((t, a) => ({ spend: t.spend + a.spend, impressions: t.impressions + a.impressions, clicks: t.clicks + a.clicks, results: t.results + a.results }), { spend: 0, impressions: 0, clicks: 0, results: 0 });
  return { since: o.window.weekStart, until: o.window.weekEnd, currency: o.currency, totals, ads: list, kept: [], swapped: [], added: [] };
}

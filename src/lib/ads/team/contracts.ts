// Ozzy's AI marketing team (prd.md). Pure TS (no Next/Prisma/Node-only imports): shared by the web app and the engine.
// Everything here is deterministic. Budget and optimisation decisions never use AI.

// ---------- team roles (labels for real work; Ozzy is the only character) ----------
export const TEAM_ROLES = {
  director: { label: "Ozzy, Marketing Director", short: "Ozzy" },
  strategy: { label: "Research & Strategy", short: "Strategy" },
  creative: { label: "Creative Studio", short: "Creative" },
  launch: { label: "Launch & Budget Desk", short: "Launch" },
  analyst: { label: "Performance Analyst", short: "Analyst" },
  leads: { label: "Lead Desk", short: "Leads" },
} as const;
export type TeamRole = keyof typeof TEAM_ROLES;

export const TEAM_ACTION_KINDS = [
  "authorized", "limit_changed", "owner_paused", "owner_resumed",
  "blocked", "lead_form_created", "campaign_launched", "ads_added", "ad_paused", "ad_rejected",
  "budget_set", "spend_cap_set", "capped", "uncapped", "service_paused", "needs_reconnect",
  "metrics_read", "focus_steered", "drop_requested", "lead_received", "report_sent",
] as const;
export type TeamActionKind = (typeof TEAM_ACTION_KINDS)[number];

// ---------- mandate ----------
export const MANDATE_STATUSES = ["active", "paused", "stopped"] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];
export const MANDATE_STATES = ["pending", "blocked", "live", "capped", "paused", "stopped", "needs_reconnect"] as const;
export type MandateState = (typeof MANDATE_STATES)[number];

export const TEAM_TERMS_VERSION = "2026-11-22";
/** Monthly ad budget bounds in USD (minor units = cents). Non-USD accounts use the same numbers in their currency for v1. */
export const MIN_MONTHLY_LIMIT_MINOR = 300_00;
export const MAX_MONTHLY_LIMIT_MINOR = 50_000_00;
export const SUGGESTED_MONTHLY_LIMIT_MINOR = 600_00;
export const MAX_ZIPS = 50;

/** Global kill switch (AdsFeatureFlag): when enabled, the engine pauses every team campaign and changes nothing else. */
export const TEAM_KILL_FLAG = "team_ops_kill";
/** Engine loop on/off (AdsFeatureFlag `sys_team_ops`, missing = off) follows the growth-systems convention. */
export const TEAM_SYSTEM_KEY = "team_ops";
/** Web -> engine: immediate pause (owner button, disconnect, refund). Payload { workspaceId, reason }. */
export const TEAM_PAUSE_JOB = "team_pause";

export const TEAM_EVENTS = {
  hired: "team_hired", metaConnected: "team_meta_connected", authorized: "team_authorized",
  launched: "team_launched", firstLead: "team_first_lead", paused: "team_paused",
} as const;

export function formatMoney(minor: number, currency = "USD"): string {
  const v = minor / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: v % 1 === 0 ? 0 : 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

/** The exact text the owner agrees to (stored verbatim on the mandate). */
export function authorizationText(o: { monthlyLimitMinor: number; currency: string; adAccountName: string; businessName: string }): string {
  const limit = formatMoney(o.monthlyLimitMinor, o.currency);
  return [
    `I authorize Komendly (Ozzy's AI marketing team) to create, run, change and pause Meta (Facebook and Instagram) ads for ${o.businessName} in my ad account "${o.adAccountName}".`,
    `Ad spend is charged by Meta to my own payment method, separately from my Komendly subscription, and will not exceed ${limit} per calendar month.`,
    `Komendly will never raise this limit. I can pause the ads or change the limit at any time on my team page.`,
    `Results are not guaranteed.`,
  ].join(" ");
}

export interface MandateInput { monthlyLimitMinor: number; zips: string[]; leadEmail: string; privacyUrl: string | null; agreed: true }

/** Validate an untrusted owner submission (web route / MCP). Money comes in as whole dollars (`monthlyLimit`). */
export function parseMandateInput(body: unknown): { ok: true; value: MandateInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Send your budget, ZIP codes and lead email." };
  const b = body as Record<string, unknown>;
  if (b.agreed !== true) return { ok: false, error: "Please tick the box to authorize the team." };
  const dollars = typeof b.monthlyLimit === "number" ? b.monthlyLimit : typeof b.monthlyLimit === "string" ? Number(b.monthlyLimit.replace(/[$,\s]/g, "")) : NaN;
  if (!Number.isFinite(dollars)) return { ok: false, error: "Enter a monthly ad budget in dollars." };
  const minor = Math.round(dollars * 100);
  if (minor < MIN_MONTHLY_LIMIT_MINOR) return { ok: false, error: `The monthly ad budget must be at least ${formatMoney(MIN_MONTHLY_LIMIT_MINOR)} so Meta has enough to learn from.` };
  if (minor > MAX_MONTHLY_LIMIT_MINOR) return { ok: false, error: `The monthly ad budget can be at most ${formatMoney(MAX_MONTHLY_LIMIT_MINOR)}.` };
  const zips = parseZips(b.zips);
  if (!zips.ok) return zips;
  const email = typeof b.leadEmail === "string" ? b.leadEmail.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: "Enter the email where leads should go." };
  let privacyUrl: string | null = null;
  if (typeof b.privacyUrl === "string" && b.privacyUrl.trim()) {
    try {
      const u = new URL(b.privacyUrl.trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
      privacyUrl = u.toString();
    } catch {
      return { ok: false, error: "The privacy policy link must be a web address (https://...)." };
    }
  }
  return { ok: true, value: { monthlyLimitMinor: minor, zips: zips.value, leadEmail: email, privacyUrl, agreed: true } };
}

export function parseZips(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(/[\s,;]+/) : [];
  const zips = [...new Set(list.map((z) => z.trim()).filter(Boolean))];
  if (!zips.length) return { ok: false, error: "Add at least one ZIP code you serve." };
  if (zips.length > MAX_ZIPS) return { ok: false, error: `Add at most ${MAX_ZIPS} ZIP codes.` };
  const bad = zips.find((z) => !/^\d{5}$/.test(z));
  if (bad) return { ok: false, error: `"${bad}" isn't a 5-digit US ZIP code.` };
  return { ok: true, value: zips };
}

// ---------- budget math (prd.md R2/R3) ----------
export const DAILY_PACING = 0.95;
export const AVG_DAYS_PER_MONTH = 30.4;
export const CAP_GUARD_RATIO = 0.98;

/** Total daily budget across the campaign's ad sets. */
export function dailyBudgetMinor(monthlyLimitMinor: number): number {
  return Math.max(100, Math.floor((monthlyLimitMinor * DAILY_PACING) / AVG_DAYS_PER_MONTH));
}

/** Split a total daily budget across n ad sets (Meta needs >= 100 minor units each). */
export function splitDailyBudget(totalMinor: number, n: number): number[] {
  if (n <= 0) return [];
  const each = Math.max(100, Math.floor(totalMinor / n));
  return Array.from({ length: n }, () => each);
}

/** YYYY-MM for a date in a given IANA zone (ad account time zone; default America/New_York). */
export function monthKey(d: Date, timeZone = "America/New_York"): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

export function dayKey(d: Date, timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Meta campaign spend_cap (lifetime): what was spent before this month + this month's limit. Hard ceiling enforced by Meta. */
export function campaignSpendCap(spendBeforeMonthMinor: number, monthlyLimitMinor: number): number {
  return Math.max(0, Math.round(spendBeforeMonthMinor)) + monthlyLimitMinor;
}

export type BudgetVerdict = { action: "run" } | { action: "cap"; reason: string };

/** Engine guard on month-to-date spend. */
export function budgetGuard(o: { monthToDateMinor: number; monthlyLimitMinor: number; currency?: string }): BudgetVerdict {
  if (o.monthToDateMinor >= o.monthlyLimitMinor * CAP_GUARD_RATIO) {
    return { action: "cap", reason: `This month's ad budget is used up (${formatMoney(o.monthToDateMinor, o.currency)} of ${formatMoney(o.monthlyLimitMinor, o.currency)}). Ads resume on the 1st.` };
  }
  return { action: "run" };
}

// ---------- stop conditions (prd.md R3.3) ----------
export interface StopInputs {
  killSwitch: boolean;
  mandateStatus: MandateStatus;
  subscriptionLive: boolean; // Ad Department / Agency, active or trialing/past_due within Stripe retries
  suspended: boolean;
  metaConnected: boolean;
}
export type StopVerdict = { stop: false } | { stop: true; state: MandateState; reason: string };

export function stopVerdict(i: StopInputs): StopVerdict {
  if (i.killSwitch) return { stop: true, state: "paused", reason: "Komendly paused all team campaigns for a safety check. Nothing is spending." };
  if (i.mandateStatus === "stopped") return { stop: true, state: "stopped", reason: "You stopped the team. Your ads are paused." };
  if (i.mandateStatus === "paused") return { stop: true, state: "paused", reason: "You paused your ads." };
  if (i.suspended) return { stop: true, state: "paused", reason: "Your account is on hold. Your ads are paused." };
  if (!i.subscriptionLive) return { stop: true, state: "stopped", reason: "Your team subscription has ended, so your ads are paused." };
  if (!i.metaConnected) return { stop: true, state: "needs_reconnect", reason: "Meta is disconnected. Reconnect it so the team can keep working." };
  return { stop: false };
}

// ---------- Special Ad Categories (prd.md §2): not run by the team in v1 ----------
const SPECIAL_PATTERNS: Array<[RegExp, string]> = [
  [/\b(real estate|realtor|realty|mortgage|home loans?|apartments? for rent|property management|landlord|housing)\b/i, "housing"],
  [/\b(loans?|lending|lender|credit cards?|credit repair|financing|debt relief|insurance)\b/i, "credit or financial services"],
  [/\b(hiring|job openings?|careers? at|recruit(ing|er|ment)|staffing agency)\b/i, "employment"],
  [/\b(political|campaign for|elect(ion|ed)|candidate|ballot|advocacy)\b/i, "social issues or politics"],
];

/** Returns the Special Ad Category a business likely falls in, or null. Conservative screen on industry + description. */
export function specialAdCategory(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [re, cat] of SPECIAL_PATTERNS) if (re.test(text)) return cat;
  return null;
}

// ---------- Performance Analyst (prd.md R5) ----------
export const MIN_AD_AGE_HOURS = 72;
export const MIN_IMPRESSIONS = 1000;
export const MIN_ACTIVE_ADS = 2;
export const TARGET_ACTIVE_ADS = 4;

export interface AdStats {
  metaAdId: string;
  adId: string | null;
  label: string; // headline/angle for the owner
  launchedAt: Date;
  active: boolean;
  spendMinor: number; // window totals (since launch, capped at 14 days)
  impressions: number;
  clicks: number;
  leads: number;
}

export type AnalystDecision =
  | { kind: "pause"; metaAdId: string; adId: string | null; label: string; reason: string; evidence: Record<string, number | string> }
  | { kind: "add"; count: number; reason: string }
  | { kind: "keep"; metaAdId: string; label: string; reason: string };

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Daily analyst pass. Pure. Only acts on ads with enough evidence (age >= 72h, >= 1,000 impressions), never leaves fewer
 * than MIN_ACTIVE_ADS running, and asks for fresh ads to refill to TARGET_ACTIVE_ADS. Worst ads are paused first.
 */
export function decideOptimizations(ads: AdStats[], o: { now: Date; dailyBudgetMinor: number; currency?: string; freshAvailable: number }): AnalystDecision[] {
  const out: AnalystDecision[] = [];
  const active = ads.filter((a) => a.active);
  const cpls = active.filter((a) => a.leads > 0).map((a) => a.spendMinor / a.leads);
  const medCpl = median(cpls);
  const money = (m: number) => formatMoney(Math.round(m), o.currency);
  const mature = (a: AdStats) => o.now.getTime() - a.launchedAt.getTime() >= MIN_AD_AGE_HOURS * 3_600_000 && a.impressions >= MIN_IMPRESSIONS;

  type Cand = { ad: AdStats; score: number; reason: string; evidence: Record<string, number | string> };
  const cands: Cand[] = [];
  for (const a of active) {
    if (!mature(a)) continue;
    const ev = { spendMinor: a.spendMinor, impressions: a.impressions, clicks: a.clicks, leads: a.leads, medianCplMinor: medCpl === null ? "none" : Math.round(medCpl) };
    if (a.leads === 0) {
      const threshold = medCpl !== null ? 3 * medCpl : 3 * o.dailyBudgetMinor;
      if (a.spendMinor >= threshold) {
        cands.push({ ad: a, score: Number.POSITIVE_INFINITY, evidence: { ...ev, thresholdMinor: Math.round(threshold) },
          reason: medCpl !== null
            ? `Spent ${money(a.spendMinor)} with no leads, while your other ads get a lead for about ${money(medCpl)}.`
            : `Spent ${money(a.spendMinor)} (3 days of budget) with no leads yet.` });
      }
    } else if (medCpl !== null && cpls.length >= 2) {
      const cpl = a.spendMinor / a.leads;
      if (cpl >= 2 * medCpl && a.spendMinor >= 1.5 * medCpl) {
        cands.push({ ad: a, score: cpl / medCpl, evidence: { ...ev, cplMinor: Math.round(cpl), thresholdMinor: Math.round(2 * medCpl) },
          reason: `Each lead costs ${money(cpl)}, more than twice your typical ${money(medCpl)}.` });
      }
    }
  }
  cands.sort((x, y) => y.score - x.score);
  let running = active.length;
  for (const c of cands) {
    if (running <= MIN_ACTIVE_ADS) break;
    out.push({ kind: "pause", metaAdId: c.ad.metaAdId, adId: c.ad.adId, label: c.ad.label, reason: c.reason, evidence: c.evidence });
    running--;
  }
  const need = Math.min(TARGET_ACTIVE_ADS - running, o.freshAvailable);
  if (need > 0) out.push({ kind: "add", count: need, reason: running < TARGET_ACTIVE_ADS ? `Bringing in ${need} fresh ad${need === 1 ? "" : "s"} so ${TARGET_ACTIVE_ADS} are running.` : "" });
  const best = winner(active);
  if (best) out.push({ kind: "keep", metaAdId: best.metaAdId, label: best.label, reason: `Best so far: ${best.leads} leads at ${money(best.spendMinor / best.leads)} each.` });
  return out;
}

/** The evidence-backed winner: lowest cost per lead among ads with >= 3 leads. null = too early to tell. */
export function winner(ads: AdStats[]): AdStats | null {
  const ok = ads.filter((a) => a.leads >= 3);
  if (!ok.length) return null;
  return ok.reduce((b, a) => (a.spendMinor / a.leads < b.spendMinor / b.leads ? a : b));
}

// ---------- honest numbers (prd.md R4) ----------
export type Certainty = "measured" | "estimated" | "unknown";
export interface LabeledNumber { value: number | null; certainty: Certainty; note?: string }

/** Projected month-end spend from month-to-date pace. Always "estimated". */
export function projectMonthSpend(monthToDateMinor: number, dayOfMonth: number, daysInMonth: number): LabeledNumber {
  if (dayOfMonth <= 0) return { value: null, certainty: "unknown" };
  return { value: Math.round((monthToDateMinor / dayOfMonth) * daysInMonth), certainty: "estimated", note: "at the current pace" };
}

/** Period-over-period cost per lead. Says "too early" unless both periods have >= 5 leads. */
export function improvementClaim(prev: { spendMinor: number; leads: number }, cur: { spendMinor: number; leads: number }, currency = "USD"): string {
  if (prev.leads < 5 || cur.leads < 5) return "Too early to tell whether cost per lead is improving (we need at least 5 leads in each period).";
  const a = prev.spendMinor / prev.leads;
  const b = cur.spendMinor / cur.leads;
  const pct = Math.round(((b - a) / a) * 100);
  const dir = pct < 0 ? `down ${-pct}%` : pct > 0 ? `up ${pct}%` : "unchanged";
  return `Cost per lead is ${dir}: ${formatMoney(Math.round(b), currency)} (${cur.leads} leads) vs ${formatMoney(Math.round(a), currency)} (${prev.leads} leads) the period before.`;
}

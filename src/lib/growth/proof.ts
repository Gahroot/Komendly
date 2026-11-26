// Proof + activation + retention machinery (systems activation, proof, cancel_save, guarantee_watch).
// Pure TS + node:crypto: web (/ads/team strip, /results, admin, consent route) and engine (engine/src/growth/proof.ts).
// Every number here comes from data (AdPerformanceDay / MetaLead / AdsEvent); nothing is invented. Email copy is FIXED
// (Nolan's words, filled only with measured values), so there is no AI-written text to review-gate.
// State lives in AdsEvent rows only:
//   live_nudge_sent {step}              one per step, max 3 per workspace
//   first_win_email_sent {kind}         once per workspace and kind (first_lead | ads_live)
//   proof_report_sent {day, ...snapshot} once per workspace and day (14 | 30); the snapshot is what /results shows
//   proof_consent {answer, key, at}     key = proof_report_sent event id; latest answer per workspace wins
//   billing_portal_opened / cancel_intent / cancel_save_email_sent
//   guarantee_breach_alerted            once per workspace
import crypto from "node:crypto";

const H = 3_600_000;
const DAY = 24 * H;
export const GUARANTEE_DAYS = 7;
export const MAX_NUDGES = 3;
export const PROOF_DAYS = [14, 30] as const;
export type ProofDay = (typeof PROOF_DAYS)[number];
/** Minimum evidence before we state a cost per lead or call a result a result. */
export const MIN_EVIDENCE = { days: 7, leads: 3 } as const;
export const NOLAN_ALERT_EMAIL = "nolan@prestyj.com";

// ---------- 1. Live in 7 days ----------

export type StepKey = "joined" | "meta" | "budget" | "live";
export interface JourneyInput { paidAt: Date | null; metaAt: Date | null; budgetAt: Date | null; liveAt: Date | null; blockedReason?: string | null; now: Date }
export interface JourneyStep { key: StepKey; label: string; done: boolean; at: string | null }
export interface Journey {
  steps: JourneyStep[];
  /** 1-based day since paying (null when unknown). */
  day: number | null;
  deadline: string | null;
  overdue: boolean;
  done: boolean;
  /** What we need from the owner next (null = nothing). */
  need: string | null;
  /** One honest sentence about where things stand. */
  line: string;
}

export function journey(i: JourneyInput): Journey {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const steps: JourneyStep[] = [
    { key: "joined", label: "Joined", done: !!i.paidAt, at: iso(i.paidAt) },
    { key: "meta", label: "Meta connected", done: !!i.metaAt, at: iso(i.metaAt) },
    { key: "budget", label: "Budget set", done: !!i.budgetAt, at: iso(i.budgetAt) },
    { key: "live", label: "Ads live", done: !!i.liveAt, at: iso(i.liveAt) },
  ];
  const day = i.paidAt ? Math.max(1, Math.floor((i.now.getTime() - i.paidAt.getTime()) / DAY) + 1) : null;
  const deadline = i.paidAt ? new Date(i.paidAt.getTime() + GUARANTEE_DAYS * DAY) : null;
  const done = !!i.liveAt;
  const overdue = !done && !!deadline && i.now.getTime() > deadline.getTime();
  let need: string | null = null;
  if (done) need = null;
  else if (!i.metaAt) need = "Connect your Meta account (step 1 below). We can't set anything up until this is done.";
  else if (!i.budgetAt) need = "Set your monthly budget and service area below, then confirm.";
  else if (i.blockedReason) need = i.blockedReason;
  const line = done
    ? "Your ads are live."
    : !i.metaAt ? "Waiting for you to connect Meta."
    : !i.budgetAt ? "Waiting for your budget."
    : i.blockedReason ? "Waiting on one thing from you."
    : "Budget set. The team is launching your campaign.";
  return { steps, day, deadline: iso(deadline), overdue, done, need, line };
}

export type NudgeStep = "meta_24h" | "meta_72h" | "budget_72h";
export const NUDGE_STEPS: readonly NudgeStep[] = ["meta_24h", "meta_72h", "budget_72h"];

/** The nudge due now (one at a time, max 3 ever, one per step), or null. Only nudges what the OWNER must do. */
export function nudgeDue(j: { paidAt: Date | null; metaAt: Date | null; budgetAt: Date | null; liveAt: Date | null }, sent: readonly string[], now: Date): NudgeStep | null {
  if (!j.paidAt || j.liveAt || sent.length >= MAX_NUDGES) return null;
  const age = (now.getTime() - j.paidAt.getTime()) / H;
  const want: NudgeStep | null = !j.metaAt ? (age >= 72 ? "meta_72h" : age >= 24 ? "meta_24h" : null) : !j.budgetAt && age >= 72 ? "budget_72h" : null;
  if (!want || sent.includes(want)) return null;
  return want;
}

export interface Note { subject: string; text: string }
const sign = (firstName: string | null) => `Hi ${firstName?.trim() || "there"},`;
const foot = (unsubscribeUrl: string) => ["", "Nolan", "", "--", `Don't want these emails? Unsubscribe: ${unsubscribeUrl}`];

export function nudgeNote(step: NudgeStep, o: { firstName: string | null; teamUrl: string; unsubscribeUrl: string }): Note {
  const body: Record<NudgeStep, string[]> = {
    meta_24h: ["Welcome aboard. The one thing we need before we can build your campaign is your Meta (Facebook) account connected.", "It takes about two minutes on your team page. If anything looks confusing, reply to this email and I'll walk you through it."],
    meta_72h: ["Your Meta account still isn't connected, so your campaign can't start yet.", "If something is in the way (no ad account, a login problem, not sure which Page), reply and tell me. I'll sort it out with you."],
    budget_72h: ["Meta is connected. The last step on your side is choosing your monthly budget and service area.", "You set the limit and we never spend past it. It's on your team page."],
  };
  return { subject: step === "budget_72h" ? "one last step before your ads start" : "your Komendly team is waiting on Meta", text: [sign(o.firstName), "", ...body[step].flatMap((p) => [p, ""]), `Your team page: ${o.teamUrl}`, ...foot(o.unsubscribeUrl)].join("\n") };
}

// ---------- 2. First wins ----------

export type FirstWin = "first_lead" | "ads_live";
/** Which first-win email is due (only for wins in the last `maxAgeDays`; never backfills old accounts). A lead covers going live. */
export function firstWinDue(o: { liveAt: Date | null; firstLeadAt: Date | null; sent: readonly string[]; now: Date; maxAgeDays?: number }): FirstWin | null {
  const max = (o.maxAgeDays ?? 7) * DAY;
  const fresh = (d: Date | null) => !!d && o.now.getTime() - d.getTime() <= max;
  if (fresh(o.firstLeadAt) && !o.sent.includes("first_lead")) return "first_lead";
  if (fresh(o.liveAt) && !o.firstLeadAt && !o.sent.includes("ads_live") && !o.sent.includes("first_lead")) return "ads_live";
  return null;
}

export function referralLine(url: string | null): string[] {
  return url ? ["", `P.S. If you know another local business owner who'd like this, send them your referral link: ${url}`] : [];
}

export function firstWinNote(kind: FirstWin, o: { firstName: string | null; businessName: string | null; teamUrl: string; referralUrl: string | null; unsubscribeUrl: string }): Note {
  const biz = o.businessName?.trim() || "your business";
  const main = kind === "first_lead"
    ? [`Your first lead just came in for ${biz}. This is real: someone filled in your lead form from your Meta ad.`, "You'll find their details on your team page, and each new lead is emailed to you as it arrives. The sooner you reply, the better the chance of a conversation."]
    : [`Your first ad for ${biz} is live on Meta.`, "It can take a little while for Meta to show it to people and for results to appear. I won't guess at numbers: your team page shows what Meta reports as it comes in, labelled as measured."];
  return { subject: kind === "first_lead" ? "your first lead just came in" : "your first ad is live", text: [sign(o.firstName), "", ...main.flatMap((p) => [p, ""]), `Your team page: ${o.teamUrl}`, ...referralLine(o.referralUrl), ...foot(o.unsubscribeUrl)].join("\n") };
}

// ---------- 3. Measured results + consent ----------

export interface PerfDayRow { day: string; spendMinor: number; leads: number }
export interface Measured {
  from: string; to: string; currency: string;
  spendMinor: number; leadsMeta: number; leadsReceived: number;
  costPerLeadMinor: number | null; dataDays: number; tooEarly: boolean;
}

/** From stored AdPerformanceDay rows + received MetaLead count. Cost per lead only with enough evidence. */
export function measureWindow(o: { from: string; to: string; currency: string; days: readonly PerfDayRow[]; leadsReceived: number }): Measured {
  const rows = o.days.filter((d) => d.day >= o.from && d.day <= o.to);
  const spendMinor = rows.reduce((s, r) => s + r.spendMinor, 0);
  const leadsMeta = rows.reduce((s, r) => s + r.leads, 0);
  const dataDays = new Set(rows.map((r) => r.day)).size;
  const tooEarly = dataDays < MIN_EVIDENCE.days || Math.max(leadsMeta, o.leadsReceived) < MIN_EVIDENCE.leads;
  return {
    from: o.from, to: o.to, currency: o.currency, spendMinor, leadsMeta, leadsReceived: o.leadsReceived, dataDays, tooEarly,
    costPerLeadMinor: !tooEarly && leadsMeta > 0 && spendMinor > 0 ? Math.round(spendMinor / leadsMeta) : null,
  };
}

export function money(minor: number, currency: string): string {
  const v = minor / 100;
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: v % 1 === 0 ? 0 : 2 }).format(v); } catch { return `${v.toFixed(2)} ${currency}`; }
}

export function measuredLines(m: Measured): string[] {
  if (!m.dataDays) return ["Meta hasn't reported any ad data for this period, so there is nothing to show yet."];
  const lines = [
    `Ad spend (measured, from Meta): ${money(m.spendMinor, m.currency)}`,
    `Leads (measured: Meta reports ${m.leadsMeta}; ${m.leadsReceived} received by Komendly)`,
    m.costPerLeadMinor !== null ? `Cost per lead (measured, spend / Meta-reported leads): ${money(m.costPerLeadMinor, m.currency)}` : "Cost per lead: too early to tell",
  ];
  if (m.tooEarly) lines.push(`It's too early to tell how well this is working: we need at least ${MIN_EVIDENCE.days} days of data and ${MIN_EVIDENCE.leads} leads before drawing a conclusion.`);
  return lines;
}

export interface ConsentLinks { yes: string; no: string }
export function resultsNote(day: ProofDay, m: Measured, o: { firstName: string | null; teamUrl: string; links: ConsentLinks; referralUrl: string | null; unsubscribeUrl: string }): Note {
  const text = [
    sign(o.firstName), "",
    `Your ads have been live for ${day} days. Here is what the data shows for ${m.from} to ${m.to}. Every number comes straight from Meta and your lead form, nothing is estimated:`, "",
    ...measuredLines(m).map((l) => `- ${l}`), "",
    "I can't promise what the next weeks will look like; this is simply what has happened so far.", "",
    `Full detail on your team page: ${o.teamUrl}`, "",
    "One question. May we use your results (and your business name) as a case study? We would show it on our website, with only the measured numbers above, with the dates. You can say no, and you can change your mind any time.", "",
    `Yes, you may: ${o.links.yes}`,
    `No, please don't: ${o.links.no}`,
    ...(day === 14 ? referralLine(o.referralUrl) : []),
    ...foot(o.unsubscribeUrl),
  ].join("\n");
  return { subject: `your first ${day} days of ads: what the data shows`, text };
}

export interface ConsentToken { p: "proof"; u: string; w: string; a: "yes" | "no"; k: string; e: number }
const mac = (secret: string, body: string) => crypto.createHmac("sha256", secret).update(`proof.${body}`).digest("base64url");
export function signConsent(t: Omit<ConsentToken, "p">, secret: string): string {
  const body = Buffer.from(JSON.stringify({ p: "proof", ...t })).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}
export function verifyConsent(token: string, secret: string, now: Date = new Date()): ConsentToken | null {
  const [body, sig, extra] = (token ?? "").split(".");
  if (!body || !sig || extra !== undefined || !secret) return null;
  const a = Buffer.from(mac(secret, body));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ConsentToken;
    if (p.p !== "proof" || (p.a !== "yes" && p.a !== "no") || !p.u || !p.w || !p.k || typeof p.e !== "number") return null;
    return p.e * 1000 > now.getTime() ? p : null;
  } catch { return null; }
}

/** When the proof email for `day` is due (ads live >= day days) and not too stale to still be relevant. */
export function proofDayDue(o: { liveAt: Date | null; sentDays: readonly number[]; now: Date }): ProofDay | null {
  if (!o.liveAt) return null;
  const age = (o.now.getTime() - o.liveAt.getTime()) / DAY;
  for (const d of PROOF_DAYS) if (age >= d && age < d + 21 && !o.sentDays.includes(d)) return d;
  return null;
}
/** Window the report covers: ads-live day through the day before `now` (UTC day keys, as AdPerformanceDay.day). */
export function proofWindow(liveAt: Date, now: Date): { from: string; to: string } {
  return { from: liveAt.toISOString().slice(0, 10), to: new Date(now.getTime() - DAY).toISOString().slice(0, 10) };
}

// Public case studies (/results): ONLY customers whose latest proof_consent is "yes", from the frozen snapshot.
export interface ConsentRow { workspaceId: string; answer: "yes" | "no"; key: string; at: Date }
export interface ReportSnapshot { id: string; workspaceId: string; day: number; businessName: string; createdAt: Date; measured: Measured }
export interface CaseStudy { workspaceId: string; businessName: string; day: number; consentedAt: string; measured: Measured; method: string }
export const RESULTS_METHOD = "Spend and leads as reported by Meta for the customer's own ad account, plus leads received through their lead form. Cost per lead = spend / Meta-reported leads. Numbers were frozen when the customer approved this page.";

export function latestConsents(rows: readonly ConsentRow[]): ConsentRow[] {
  const by = new Map<string, ConsentRow>();
  for (const r of [...rows].sort((a, b) => a.at.getTime() - b.at.getTime())) by.set(r.workspaceId, r);
  return [...by.values()];
}
export function buildCaseStudies(consents: readonly ConsentRow[], reports: readonly ReportSnapshot[], o: { includeTooEarly?: boolean } = {}): CaseStudy[] {
  const byId = new Map(reports.map((r) => [r.id, r]));
  const out: CaseStudy[] = [];
  for (const c of latestConsents(consents)) {
    if (c.answer !== "yes") continue;
    const r = byId.get(c.key);
    if (!r || r.workspaceId !== c.workspaceId || !r.businessName.trim()) continue;
    if (r.measured.tooEarly && !o.includeTooEarly) continue;
    out.push({ workspaceId: c.workspaceId, businessName: r.businessName.trim(), day: r.day, consentedAt: c.at.toISOString(), measured: r.measured, method: RESULTS_METHOD });
  }
  return out.sort((a, b) => b.consentedAt.localeCompare(a.consentedAt));
}
export const RESULTS_EMPTY = "Our first customers' results will appear here as they're measured.";
export const resultsIndexable = (n: number) => n >= 1;

// ---------- 5. Cancel-intent save ----------

export function cancelSaveDue(o: { openedAt: Date; now: Date; plan: string; active: boolean; recentPaymentFailure: boolean; sentWithinDays: boolean }): boolean {
  const age = o.now.getTime() - o.openedAt.getTime();
  if (!o.active || o.recentPaymentFailure || o.sentWithinDays) return false;
  if (!["autopilot", "ad_department", "agency"].includes(o.plan)) return false;
  return age >= 10 * 60_000 && age <= 6 * H;
}
export function cancelSaveNote(o: { firstName: string | null; unsubscribeUrl: string }): Note {
  return {
    subject: "what went wrong?",
    text: [sign(o.firstName), "", "I'm Nolan, I built Komendly. I saw you were in your billing settings. If you're thinking about cancelling, I'd like to know honestly: what went wrong, or what didn't work the way you hoped?", "", "Just reply to this email. I read every reply myself, and if it's something I can fix, I will. If you do decide to cancel, that's fine too, no hard feelings.", ...foot(o.unsubscribeUrl)].join("\n"),
  };
}

// ---------- 6. Guarantee operations ----------

export type BreachCause = "meta_not_connected" | "budget_not_set" | "not_live";
export interface Breach { cause: BreachCause; daysSincePaid: number; daysLate: number }
/** Paid more than 7 days ago and still no live ads. Surfaces only; never refunds. Refunded/inactive workspaces are excluded by the caller. */
export function guaranteeBreach(o: { paidAt: Date | null; metaAt: Date | null; budgetAt: Date | null; liveAt: Date | null; now: Date }): Breach | null {
  if (!o.paidAt || o.liveAt) return null;
  const since = (o.now.getTime() - o.paidAt.getTime()) / DAY;
  if (since <= GUARANTEE_DAYS) return null;
  return { cause: !o.metaAt ? "meta_not_connected" : !o.budgetAt ? "budget_not_set" : "not_live", daysSincePaid: Math.floor(since), daysLate: Math.floor(since - GUARANTEE_DAYS) };
}
export const BREACH_TEXT: Record<BreachCause, string> = {
  meta_not_connected: "Meta not connected (waiting on the customer)",
  budget_not_set: "Meta connected, budget not set (waiting on the customer)",
  not_live: "Budget set, ads still not live (our side)",
};
export function breachAlert(o: { workspaceId: string; businessName: string; ownerEmail: string; breach: Breach; adminUrl: string }): Note {
  return {
    subject: `Live-in-7-days breach: ${o.businessName}`,
    text: [`${o.businessName} (${o.ownerEmail}) paid ${o.breach.daysSincePaid} days ago and has no live ads (${o.breach.daysLate} days past 7).`, `Where it stands: ${BREACH_TEXT[o.breach.cause]}.`, `Workspace: ${o.workspaceId}`, `Review and refund if due (nothing is refunded automatically): ${o.adminUrl}`].join("\n"),
  };
}

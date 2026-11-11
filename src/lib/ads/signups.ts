// Pure per-person sign-up rows for /admin/ads/signups (no I/O). The loader is signups-queries.ts.
import { isInternalEmail } from "@/lib/internal-email";
import type { FirstTouch } from "@/lib/analytics/first-touch";
import { classifyTouch, revenuePayments, sumRevenueCents } from "./funnel";

export const SIGNUP_STAGES = ["not_verified", "verified_no_trial", "trial_running", "trial_done", "checkout_started", "paid", "churned"] as const;
export type SignupStage = (typeof SIGNUP_STAGES)[number];
export const STAGE_LABEL: Record<SignupStage, string> = {
  not_verified: "Not verified",
  verified_no_trial: "Verified, no trial",
  trial_running: "Trial running",
  trial_done: "Trial done",
  checkout_started: "Checkout started",
  paid: "Paid",
  churned: "Churned",
};

const ACTIVE = new Set(["active", "past_due", "trialing"]);
/** Internal / test accounts (shared rule in src/lib/internal-email.ts). */
export const isTestEmail = (email: string): boolean => isInternalEmail(email);

export type SignupEvent = { name: string; createdAt: Date; props: unknown };
export type SignupRun = { url: string; isTrial: boolean; status: string; createdAt: Date; firstAdAt: Date | null; completedAt: Date | null };
export type SignupInput = {
  userId: string | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  workspaceId: string;
  workspaceName: string | null;
  signedUpAt: Date;
  touch: FirstTouch | null;
  /** All AdsEvents of the workspace (any order). */
  events: readonly SignupEvent[];
  runs: readonly SignupRun[];
  adsReady: number;
  adsTotal: number;
  workspace: { adsPlan: string; subscriptionStatus: string; stripeSubscriptionId: string | null; canceledAt: Date | null } | null;
};

export type SignupView = {
  workspaceId: string;
  workspaceName: string;
  userId: string | null;
  email: string;
  isTest: boolean;
  signedUpAt: Date;
  emailVerifiedAt: Date | null;
  isMeta: boolean;
  utmSource: string | null;
  utmCampaign: string | null;
  /** Meta ad id (utm_content) and ad set id (utm_term) on Meta links. */
  utmContent: string | null;
  utmTerm: string | null;
  websites: string[];
  trialStartedAt: Date | null;
  firstAdReadyAt: Date | null;
  runCompletedAt: Date | null;
  adsReady: number;
  adsTotal: number;
  downloads: number;
  upsellShownAt: Date | null;
  checkoutStartedAt: Date | null;
  paidAt: Date | null;
  paidCents: number;
  plan: string;
  subscriptionStatus: string;
  stage: SignupStage;
};

const minDate = (ds: readonly (Date | null | undefined)[]): Date | null =>
  ds.reduce<Date | null>((m, d) => (d && (!m || d.getTime() < m.getTime()) ? d : m), null);
const firstEvent = (events: readonly SignupEvent[], name: string): Date | null => minDate(events.filter((e) => e.name === name).map((e) => e.createdAt));

export function buildSignupRow(i: SignupInput): SignupView {
  const ev = i.events;
  const pays = revenuePayments([...ev].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
  const trialRuns = i.runs.filter((r) => r.isTrial);
  const trialStartedAt = firstEvent(ev, "trial_started") ?? minDate(trialRuns.map((r) => r.createdAt));
  const firstAdReadyAt = firstEvent(ev, "first_ad_ready") ?? minDate(i.runs.map((r) => r.firstAdAt));
  const runCompletedAt = firstEvent(ev, "run_completed") ?? minDate(i.runs.map((r) => r.completedAt));
  const checkoutStartedAt = firstEvent(ev, "checkout_started");
  const paidAt = pays[0]?.createdAt ?? null;
  const w = i.workspace;
  const activeSub = !!w?.stripeSubscriptionId && ACTIVE.has(w.subscriptionStatus);
  const trialDone = !!runCompletedAt || trialRuns.some((r) => r.status === "completed" || r.status === "partial");
  let stage: SignupStage;
  if (paidAt || activeSub) stage = activeSub || (!w?.canceledAt && !ev.some((e) => e.name === "churned")) ? "paid" : "churned";
  else if (checkoutStartedAt) stage = "checkout_started";
  else if (trialDone) stage = "trial_done";
  else if (trialStartedAt || i.runs.length > 0) stage = "trial_running";
  else stage = i.emailVerifiedAt ? "verified_no_trial" : "not_verified";
  const t = i.touch;
  const websites = [...new Set([...i.runs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((r) => r.url))];
  const email = i.email ?? "(deleted user)";
  return {
    workspaceId: i.workspaceId,
    workspaceName: i.workspaceName ?? i.workspaceId,
    userId: i.userId,
    email,
    isTest: isTestEmail(email),
    signedUpAt: i.signedUpAt,
    emailVerifiedAt: i.emailVerifiedAt,
    isMeta: classifyTouch(t).channel === "meta_paid",
    utmSource: t?.utm_source ?? null,
    utmCampaign: t?.utm_campaign ?? null,
    utmContent: t?.utm_content ?? null,
    utmTerm: t?.utm_term ?? null,
    websites,
    trialStartedAt,
    firstAdReadyAt,
    runCompletedAt,
    adsReady: i.adsReady,
    adsTotal: i.adsTotal,
    downloads: ev.filter((e) => e.name === "export_downloaded").length,
    upsellShownAt: firstEvent(ev, "upsell_shown"),
    checkoutStartedAt,
    paidAt,
    paidCents: sumRevenueCents(pays),
    plan: w?.adsPlan ?? "—",
    subscriptionStatus: w?.subscriptionStatus ?? "—",
    stage,
  };
}

export type SignupFilter = { source: "all" | "facebook" | "other"; stage: SignupStage | "all"; showTest: boolean };

export function parseSignupFilter(q: { source?: string; stage?: string; test?: string }): SignupFilter {
  const source = q.source === "facebook" || q.source === "other" ? q.source : "all";
  const stage = (SIGNUP_STAGES as readonly string[]).includes(q.stage ?? "") ? (q.stage as SignupStage) : "all";
  return { source, stage, showTest: q.test === "1" };
}

/** Filter and sort newest sign-up first (workspace id asc for ties). */
export function filterSignupRows(rows: readonly SignupView[], f: SignupFilter): SignupView[] {
  return rows
    .filter((r) => (f.showTest || !r.isTest) && (f.source === "all" || (f.source === "facebook") === r.isMeta) && (f.stage === "all" || r.stage === f.stage))
    .sort((a, b) => b.signedUpAt.getTime() - a.signedUpAt.getTime() || a.workspaceId.localeCompare(b.workspaceId));
}

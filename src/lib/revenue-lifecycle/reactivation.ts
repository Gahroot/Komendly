// Reactivation (system `reactivation`): day 30/60/90 "what's new" for free-pack users who never paid, built from REAL
// product changes only (PRODUCT_CHANGES), plus a short feedback ask for cancelled subscribers with an optional one-time
// offer that stays disabled until Nolan fills REACTIVATION_OFFER. Winback (winback.ts) still owns failed-payment and the
// day-3/14/30 churn steps; this never fires within 14 days of one of those.
import { withSystemUtm } from "../growth/systems";
import { capBlocks, compose, DAY, suppressedBy, type Note, type SendRecord, type Suppression } from "./core";

export const REACTIVATION_SYSTEM = "reactivation" as const;
export const REACTIVATION_STEPS = [30, 60, 90] as const;
export type ReactivationStep = (typeof REACTIVATION_STEPS)[number];

/** Real shipped changes only (add a line when something actually ships; never invent). `path` is an app route. */
export interface ProductChange { date: string; line: string; path: string }
export const PRODUCT_CHANGES: readonly ProductChange[] = [
  { date: "2026-11-20", line: "Ad ideas and example ads for 45 local trades, free to browse", path: "/ad-examples/ideas" },
  { date: "2026-11-21", line: "A free Meta ad checker: paste an ad and see how it scores", path: "/ad-check" },
  { date: "2026-11-22", line: "Growth Autopilot: we launch and run your ads in your own Meta account, set up with you", path: "/ads/team" },
];

/** Nolan fills this to enable a one-time honest offer for cancelled subscribers. Disabled by default. */
export const REACTIVATION_OFFER: { enabled: boolean; headline: string; terms: string; path: string } = { enabled: false, headline: "", terms: "", path: "/ads/pricing" };
export const offerReady = (o = REACTIVATION_OFFER) => o.enabled && o.headline.trim().length > 0 && o.terms.trim().length > 0;

export interface DormantInput {
  firstName: string | null;
  packFinishedAt: Date | null;
  suppression: Suppression;
  sends: SendRecord[];
  reactivationSent: ReactivationStep[];
  appUrl: string;
  unsubscribeUrl: string;
}
export function changesSince(since: Date, changes: readonly ProductChange[] = PRODUCT_CHANGES, now: Date = new Date()): ProductChange[] {
  return changes.filter((c) => new Date(`${c.date}T00:00:00Z`) > since && new Date(`${c.date}T00:00:00Z`) <= now);
}
export function dormantDue(i: DormantInput, now: Date, changes: readonly ProductChange[] = PRODUCT_CHANGES): ReactivationStep | null {
  if (!i.packFinishedAt || suppressedBy(i.suppression) || capBlocks(i.sends, now)) return null;
  const age = now.getTime() - i.packFinishedAt.getTime();
  const step = REACTIVATION_STEPS.find((d) => !i.reactivationSent.includes(d) && age >= d * DAY && age < (d + 10) * DAY);
  if (!step) return null;
  if (!changesSince(i.packFinishedAt, changes, now).length) return null; // nothing real to say: say nothing
  return step;
}
const ASK: Record<ReactivationStep, string> = { 30: "What got in the way of using your ads?", 60: "Is running ads still on your list for this year?", 90: "Should I stop emailing you about this, or is it worth a follow-up later?" };
export function dormantNote(i: DormantInput, step: ReactivationStep, now: Date, changes: readonly ProductChange[] = PRODUCT_CHANGES): Note {
  const news = changesSince(i.packFinishedAt ?? now, changes, now).slice(-3);
  const u = (p: string) => withSystemUtm(`${i.appUrl}${p}`, REACTIVATION_SYSTEM, { campaign: `d${step}`, medium: "email", content: "cta" });
  const lines = news.map((c) => `- ${c.line}: ${u(c.path)}`).join("\n");
  return { subject: step === 90 ? "last update from me" : "what's new at Komendly since your free ads", text: compose({ firstName: i.firstName, paragraphs: ["Since you made your free ads, here's what's actually new:", lines, "Your free ads are still in your account."], question: ASK[step], unsubscribeUrl: i.unsubscribeUrl }) };
}

export interface CancelledInput {
  firstName: string | null;
  canceledAt: Date | null;
  active: boolean;
  suppression: Suppression;
  sends: SendRecord[];
  sentFeedback: boolean;
  /** A winback churn email (c1/c2/c3) went out in the last 14 days. */
  winbackRecent: boolean;
  appUrl: string;
  unsubscribeUrl: string;
}
export const CANCEL_FEEDBACK_DAY = 45;
export function cancelledDue(i: CancelledInput, now: Date): boolean {
  if (!i.canceledAt || i.active || i.sentFeedback || i.winbackRecent) return false;
  if (suppressedBy(i.suppression, { ignorePaid: true }) || capBlocks(i.sends, now)) return false;
  const age = now.getTime() - i.canceledAt.getTime();
  return age >= CANCEL_FEEDBACK_DAY * DAY && age < (CANCEL_FEEDBACK_DAY + 15) * DAY;
}
export function cancelledNote(i: CancelledInput, offer = REACTIVATION_OFFER): Note {
  const paragraphs = ["You cancelled a while ago and I'd rather learn from it than guess. Your feedback goes straight to me."];
  if (offerReady(offer)) paragraphs.push(`If coming back ever makes sense, there's a one-time offer: ${offer.headline}. ${offer.terms}`);
  const link = offerReady(offer) ? { label: "Details", url: withSystemUtm(`${i.appUrl}${offer.path}`, REACTIVATION_SYSTEM, { campaign: "cancelled_d45", medium: "email", content: "offer" }) } : undefined;
  return { subject: "what would have made it worth keeping?", text: compose({ firstName: i.firstName, paragraphs, link, question: "What's the main reason you stopped?", unsubscribeUrl: i.unsubscribeUrl }) };
}

// Shared building blocks for the revenue lifecycle systems (nurture, activation rescue, reactivation, expansion).
// Pure TS, no package imports (the engine imports it). Every email: plain text, openly from Nolan (founderFrom),
// Reply-To nolan@prestyj.com, unsubscribe link, ONE question, never a promised result.
import { TRANSACTIONAL_KINDS } from "../ads/lifecycle/select";

export const NOLAN_REPLY_TO = "nolan@prestyj.com";
export const RL_SENT_EVENT = "rl_email_sent";
/** AdsEvent names that are a customer-facing email send. Used by the global caps. */
export const SEND_EVENT_NAMES = ["email_sent", "winback_email_sent", "live_nudge_sent", "first_win_email_sent", "proof_report_sent", "cancel_save_email_sent", "recovery_email_sent", RL_SENT_EVENT] as const;
export const H = 3_600_000;
export const DAY = 24 * H;

export interface Note { subject: string; text: string }
export interface SendRecord { kind: string; at: Date }

/** Global frequency caps (extends the lifecycle 24h cap in select.ts MIN_GAP_MS): <=1 per 24h and <=3 per 7 days per user. */
export const GLOBAL_CAPS = { minGapMs: DAY, maxPerWeek: 3, weekMs: 7 * DAY } as const;

export function capBlocks(sends: readonly SendRecord[], now: Date): "gap" | "week" | null {
  const counted = sends.filter((s) => !TRANSACTIONAL_KINDS.has(s.kind));
  const t = now.getTime();
  if (counted.some((s) => t - s.at.getTime() < GLOBAL_CAPS.minGapMs)) return "gap";
  if (counted.filter((s) => t - s.at.getTime() < GLOBAL_CAPS.weekMs).length >= GLOBAL_CAPS.maxPerWeek) return "week";
  return null;
}

export interface Suppression { test: boolean; unsubscribed: boolean; replied: boolean; paid: boolean }
export function suppressedBy(s: Suppression, o: { ignorePaid?: boolean; ignoreReplied?: boolean } = {}): string | null {
  if (s.test) return "test_user";
  if (s.unsubscribed) return "unsubscribed";
  if (s.replied && !o.ignoreReplied) return "replied";
  if (s.paid && !o.ignorePaid) return "paid";
  return null;
}

export const greet = (firstName: string | null) => `Hi ${firstName?.trim() || "there"},`;
export function compose(o: { firstName: string | null; paragraphs: string[]; link?: { label: string; url: string }; question: string; unsubscribeUrl: string }): string {
  return [greet(o.firstName), "", ...o.paragraphs.flatMap((p) => [p, ""]), ...(o.link ? [`${o.link.label}: ${o.link.url}`, ""] : []), o.question, "", "Nolan", "", "--", `Don't want these emails? Unsubscribe: ${o.unsubscribeUrl}`].join("\n");
}

const PROMISE_RE = /\b(guarantee[sd]? (you|leads|sales|results)|you will (get|see|make)|will (get|bring|generate) you|X ?times|\d+x\b|double your|triple your)\b/i;
/** Last-line check on every composed note: exactly one question mark in the ask, no promised results. Returns a problem or null. */
export function checkNote(n: Note): string | null {
  if (!n.subject.trim() || n.subject.length > 80) return "subject length";
  if (/\|\s*Komendly/i.test(n.subject)) return "subject suffix";
  if (PROMISE_RE.test(n.text)) return "promises results";
  if (!/Unsubscribe: https?:\/\//.test(n.text)) return "no unsubscribe";
  const body = n.text.split("\n--\n")[0] ?? n.text;
  const q = (body.match(/\?/g) ?? []).length;
  return q >= 1 ? null : "no question";
}

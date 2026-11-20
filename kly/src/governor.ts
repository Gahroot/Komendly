// Hard-rule governors (autopilot plan, section 5). Checked every tick before the sender; any stop pauses ALL cold
// sending (warm-up, inbound and opt-outs keep running). Each new stop is logged (KlyDecision "governor") and emailed
// once via the alert path (ADS_ALERT_EMAIL).
//  - complaint:  any spam complaint on a cold email -> stop until an operator resumes.
//  - bounce:     bounce rate above 2% over the last 7 days of cold sends (>= MIN_BOUNCE_SAMPLE sends) -> stop.
//  - no_positive: 2,000 cold emails since the current copy arms went live with zero positive replies -> stop: the
//                 message needs rewriting (shipping new body arms starts a new window).
// Resume: set KLY_GOVERNOR_RESUME_AFTER=<ISO time> on the kly service; anything before it no longer counts.
import { MAX_BOUNCE_RATE, MIN_BOUNCE_SAMPLE, MIN_BOUNCES } from "../../src/lib/ads/outbound/policy";
import type { Db } from "./db";
import type { AlertFn } from "./replies";
import { decide } from "./settings";

export const NO_POSITIVE_LIMIT = 2000;
export const BOUNCE_WINDOW_MS = 7 * 86_400_000;
export const POSITIVE_INTENTS = ["interested", "question"];
export type GovernorRule = "complaint" | "bounce" | "no_positive";

export interface GovernorStats {
  complaints: number;
  sends7d: number;
  bounces7d: number;
  sendsSinceCopy: number;
  positiveSinceCopy: number;
}

/** Pure: the first rule that stops sending, with a human reason; null = keep sending. */
export function governorVerdict(s: GovernorStats): { rule: GovernorRule; reason: string } | null {
  if (s.complaints > 0) return { rule: "complaint", reason: `${s.complaints} spam complaint(s) on cold email` };
  const rate = s.sends7d ? s.bounces7d / s.sends7d : 0;
  if (s.sends7d >= MIN_BOUNCE_SAMPLE && s.bounces7d >= MIN_BOUNCES && rate > MAX_BOUNCE_RATE) return { rule: "bounce", reason: `bounce rate ${(rate * 100).toFixed(1)}% over ${s.sends7d} cold emails in 7 days (limit ${MAX_BOUNCE_RATE * 100}%)` };
  if (s.sendsSinceCopy >= NO_POSITIVE_LIMIT && s.positiveSinceCopy === 0) return { rule: "no_positive", reason: `${s.sendsSinceCopy} cold emails since the current copy went live and no positive reply: the message needs rewriting` };
  return null;
}

export function resumeAfter(env: NodeJS.ProcessEnv = process.env): Date | null {
  const raw = env.KLY_GOVERNOR_RESUME_AFTER?.trim();
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** When the current copy went live: the oldest live local body arm (new rewrites retire the old ones). */
export async function copyLiveSince(db: Db): Promise<Date | null> {
  const arms = await db.klyArm.findMany({ where: { dimension: "body", status: { not: "retired" } }, select: { createdAt: true, content: true } });
  const local = arms.filter((a) => (a.content as { audience?: unknown } | null)?.audience !== "agency");
  const t = local.map((a) => a.createdAt.getTime());
  return t.length ? new Date(Math.min(...t)) : null;
}

export async function governorStats(db: Db, now: Date, env: NodeJS.ProcessEnv = process.env): Promise<GovernorStats> {
  const resume = resumeAfter(env);
  const after = (d: Date | null): Date => new Date(Math.max(d?.getTime() ?? 0, resume?.getTime() ?? 0));
  const cold = { dryRun: false, kind: "sequence" };
  const copyStart = after(await copyLiveSince(db));
  const weekStart = after(new Date(now.getTime() - BOUNCE_WINDOW_MS));
  const [complaints, sends7d, bounces7d, sendsSinceCopy, positiveSinceCopy] = await Promise.all([
    db.outboundSend.count({ where: { ...cold, complained: true, sentAt: { gte: after(null) } } }),
    db.outboundSend.count({ where: { ...cold, sentAt: { gte: weekStart } } }),
    db.outboundSend.count({ where: { ...cold, bounced: true, sentAt: { gte: weekStart } } }),
    db.outboundSend.count({ where: { ...cold, sentAt: { gte: copyStart } } }),
    db.outboundLead.count({ where: { replyIntent: { in: POSITIVE_INTENTS }, repliedAt: { gte: copyStart } } }),
  ]);
  return { complaints, sends7d, bounces7d, sendsSinceCopy, positiveSinceCopy };
}

/** Loop step: the stop reason (null = send). A new stop is logged + alerted once (deduped per rule since resume). */
export async function governorCheck(db: Db, alert: AlertFn, now: Date, env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const v = governorVerdict(await governorStats(db, now, env));
  if (!v) return null;
  const since = resumeAfter(env) ?? new Date(0);
  const already = await db.klyDecision.count({ where: { kind: "governor", createdAt: { gte: since }, data: { path: ["rule"], equals: v.rule } } });
  if (!already) {
    await decide(db, "governor", `Stopped all cold sending: ${v.reason}.`, { rule: v.rule });
    const fix = v.rule === "no_positive"
      ? "Rewrite the cold email (new body arms in src/lib/ads/outbound/copy.ts), deploy, then set KLY_GOVERNOR_RESUME_AFTER to now on the kly service."
      : "Find the cause (list quality, a mailbox or domain), then set KLY_GOVERNOR_RESUME_AFTER to now on the kly service to resume.";
    await alert(v.rule === "no_positive" ? "[Kly] Cold email stopped: the message needs rewriting" : `[Kly] Cold email stopped: ${v.rule}`, `Kly stopped all cold sending at ${now.toISOString()}: ${v.reason}.\n\n${fix}\n\nWarm-up, replies, bounces and unsubscribes keep being processed.`);
  }
  return v.reason;
}

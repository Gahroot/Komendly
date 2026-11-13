// KlySettings (singleton "kly"), decisions log, KlyDaily counters, budget.
import type { Prisma } from "@prisma/client";
import type { Db } from "./db";

export const SETTINGS_ID = "kly";
export const OUTBOUND_FLAG = "outbound";
export type KlySettingsRow = NonNullable<Awaited<ReturnType<Db["klySettings"]["findUnique"]>>>;

export async function getSettings(db: Db): Promise<KlySettingsRow> {
  return db.klySettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID }, update: {} });
}

/** Kill switch: KlySettings.enabled AND AdsFeatureFlag "outbound". */
export async function killSwitchReason(db: Db, s: KlySettingsRow): Promise<string | null> {
  if (!s.enabled) return "disabled in Kly settings";
  const flag = await db.adsFeatureFlag.findUnique({ where: { key: OUTBOUND_FLAG } });
  return flag?.enabled ? null : 'feature flag "outbound" is off';
}

export type DecisionKind = "scale" | "arm_new" | "arm_retire" | "champion" | "segment" | "pause" | "resume" | "insight" | "budget" | "error";

export async function decide(db: Db, kind: DecisionKind, summary: string, data: Record<string, unknown> = {}): Promise<void> {
  await db.klyDecision.create({ data: { kind, summary: summary.slice(0, 1000), data: data as Prisma.InputJsonValue } });
}

/** Has a decision of this kind been logged since `since`? (daily jobs survive restarts this way) */
export async function decidedSince(db: Db, kind: DecisionKind, since: Date): Promise<boolean> {
  return (await db.klyDecision.count({ where: { kind, createdAt: { gte: since } } })) > 0;
}

export function dayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

type Counter = "giftsMade" | "giftsRejected" | "bounces" | "complaints" | "revenueCents";

/** Event counters (incremented once, at the transition that guarantees it). */
export async function bumpDaily(db: Db, now: Date, inc: Partial<Record<Counter, number>> & { costMicros?: bigint }): Promise<void> {
  const day = dayStart(now);
  const data: Prisma.KlyDailyUpdateInput = {};
  const create: Prisma.KlyDailyCreateInput = { day };
  for (const [k, v] of Object.entries(inc)) {
    if (!v) continue;
    (data as Record<string, unknown>)[k] = { increment: v };
    (create as Record<string, unknown>)[k] = v;
  }
  await db.klyDaily.upsert({ where: { day }, create, update: data });
}

/** Cost attributed to a lead and today's total. */
export async function addCost(db: Db, leadId: string | null, micros: number | bigint, now: Date): Promise<void> {
  const m = BigInt(Math.round(Number(micros)));
  if (m <= 0n) return;
  if (leadId) await db.outboundLead.update({ where: { id: leadId }, data: { costMicros: { increment: m } } });
  await bumpDaily(db, now, { costMicros: m });
}

/** Recomputed counters for today (idempotent; called each tick). */
export async function upsertDaily(db: Db, now: Date): Promise<void> {
  const day = dayStart(now);
  const since = { gte: day };
  const [found, qualified, sent, clicks, replies, positive, signups, paid, calls, giftYes, voiceOptOuts] = await Promise.all([
    db.outboundLead.count({ where: { createdAt: since } }),
    db.outboundLead.count({ where: { createdAt: since, NOT: { error: "unqualified" } } }),
    db.outboundSend.count({ where: { sentAt: since, dryRun: false, kind: "sequence" } }),
    db.outboundLead.count({ where: { clickedAt: since } }),
    db.outboundLead.count({ where: { repliedAt: since } }),
    db.outboundLead.count({ where: { repliedAt: since, replyIntent: { in: ["interested", "question"] } } }),
    db.outboundLead.count({ where: { signedUpAt: since } }),
    db.outboundLead.count({ where: { paidAt: since } }),
    db.outboundVoiceEvent.count({ where: { type: "call_started", at: since } }),
    db.outboundVoiceEvent.count({ where: { type: "gift_yes", at: since } }),
    db.outboundVoiceEvent.count({ where: { type: "opt_out", at: since } }),
  ]);
  const v = { found, qualified, sent, clicks, replies, positive, signups, paid, calls, giftYes, voiceOptOuts };
  await db.klyDaily.upsert({ where: { day }, create: { day, ...v }, update: v });
}

/** AI + generation spend this calendar month (micros) vs the budget. */
export async function overBudget(db: Db, s: KlySettingsRow, now: Date): Promise<{ over: boolean; spentMicros: bigint; budgetMicros: bigint }> {
  const agg = await db.klyDaily.aggregate({ where: { day: { gte: monthStart(now) } }, _sum: { costMicros: true } });
  const spentMicros = agg._sum.costMicros ?? 0n;
  const budgetMicros = BigInt(s.monthlyBudgetCents) * 10_000n;
  return { over: spentMicros >= budgetMicros, spentMicros, budgetMicros };
}

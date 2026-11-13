// Autoscale = a brake. Each mailbox's warm-up ramp paces sending (10/day, +5/day, up to its cap); this volume stays at
// dailySendCeiling unless bad signals (complaints, bounces, collapsing replies) cut it. After a cut it recovers ~20%/day
// while healthy. Stored as the latest KlyDecision kind "scale" (data.volume, data.brake), so it survives restarts.
import type { Db } from "./db";
import { MAX_BOUNCE_RATE, MIN_BOUNCE_SAMPLE, MIN_BOUNCES } from "../../src/lib/ads/outbound/policy";
import { capacityOf, mailDomain } from "./mailboxes";
import { dayStart, decide, type KlySettingsRow } from "./settings";

export const MIN_VOLUME = 5;

export interface Health {
  sends: number;
  bounces: number;
  complaints: number;
  /** Reply rate over the recent window vs the earlier baseline. */
  replyRate: number;
  baselineReplyRate: number | null;
}

export function nextVolume(current: number, ceiling: number, h: Health): { volume: number; reason: string; brake: boolean } {
  const r = nextVolumeRaw(current, ceiling, h);
  return { ...r, brake: r.volume < Math.min(Math.max(current, MIN_VOLUME), Math.max(MIN_VOLUME, ceiling)) || (r.volume < ceiling && r.reason !== "healthy") };
}

function nextVolumeRaw(current: number, ceiling: number, h: Health): { volume: number; reason: string } {
  const cap = Math.max(MIN_VOLUME, ceiling);
  const cur = Math.min(Math.max(current, MIN_VOLUME), cap);
  if (h.complaints > 0) return { volume: Math.max(MIN_VOLUME, Math.floor(cur / 2)), reason: `${h.complaints} spam complaint(s)` };
  const bounce = h.sends > 0 ? h.bounces / h.sends : 0;
  if (h.sends >= MIN_BOUNCE_SAMPLE && h.bounces >= MIN_BOUNCES && bounce >= MAX_BOUNCE_RATE) return { volume: Math.max(MIN_VOLUME, Math.floor(cur / 2)), reason: `bounce rate ${(bounce * 100).toFixed(1)}%` };
  if (h.sends >= 50 && h.baselineReplyRate !== null && h.baselineReplyRate > 0 && h.replyRate < h.baselineReplyRate * 0.5) {
    return { volume: Math.max(MIN_VOLUME, Math.floor(cur * 0.75)), reason: `reply rate fell to ${(h.replyRate * 100).toFixed(1)}% from ${(h.baselineReplyRate * 100).toFixed(1)}%` };
  }
  if (cur >= cap) return { volume: cap, reason: "healthy" };
  // Recovering from a cut: back up gradually while healthy (or hold without enough data).
  if (h.sends < Math.min(20, cur)) return { volume: cur, reason: "recovering: not enough recent sends to judge" };
  return { volume: Math.min(cap, Math.max(cur + 2, Math.ceil(cur * 1.2))), reason: `recovering: bounce ${(bounce * 100).toFixed(1)}%, no complaints` };
}

export async function currentVolume(db: Db, s: KlySettingsRow): Promise<number> {
  if (!s.autoScale) return s.dailySendCeiling;
  // Only a brake (or the recovery after one) holds volume below the ceiling.
  const last = await db.klyDecision.findFirst({ where: { kind: "scale" }, orderBy: { createdAt: "desc" }, select: { data: true } });
  const d = (last?.data ?? {}) as { volume?: unknown; brake?: unknown };
  const v = Number(d.volume);
  return d.brake === true && Number.isFinite(v) && v > 0 ? Math.min(v, s.dailySendCeiling) : s.dailySendCeiling;
}

/** Once per UTC day (after sends exist): recompute volume from the last 7 days vs the 21 before. */
export async function autoscaleTick(db: Db, s: KlySettingsRow, now: Date): Promise<number> {
  const cur = await currentVolume(db, s);
  if (!s.autoScale) return cur;
  if ((await db.klyDecision.count({ where: { kind: "scale", createdAt: { gte: dayStart(now) } } })) > 0) return cur;
  const wk = new Date(now.getTime() - 7 * 86_400_000);
  const base = new Date(now.getTime() - 28 * 86_400_000);
  const recent = await db.outboundSend.findMany({ where: { dryRun: false, kind: "sequence", sentAt: { gte: wk } }, select: { bounced: true, complained: true, replied: true } });
  const older = await db.outboundSend.findMany({ where: { dryRun: false, kind: "sequence", sentAt: { gte: base, lt: wk } }, select: { replied: true } });
  if (recent.length === 0) return cur;
  const h: Health = {
    sends: recent.length,
    bounces: recent.filter((r) => r.bounced).length,
    complaints: recent.filter((r) => r.complained).length,
    replyRate: recent.filter((r) => r.replied).length / recent.length,
    baselineReplyRate: older.length >= 50 ? older.filter((r) => r.replied).length / older.length : null,
  };
  const n = nextVolume(cur, s.dailySendCeiling, h);
  const verb = n.volume > cur ? "Raised" : n.volume < cur ? "Lowered" : "Kept";
  if (verb === "Kept" && !n.brake) return n.volume; // nothing to report: running at the ceiling, warm-up sets the pace
  await decide(db, "scale", `${verb} daily send volume ${n.volume === cur ? "at" : `from ${cur} to`} ${n.volume} (${n.reason}).`, { volume: n.volume, previous: cur, brake: n.brake, ...h });
  return n.volume;
}

/** Today's sendable capacity: only ready, unpaused mailboxes on unpaused domains, each domain clamped to its daily cap
 * (Gmail ramps 10 -> 25 -> 40; vendor-warmed mailboxes count their flat cap once readyAt has passed). */
export async function warmupCapacity(db: Db, addresses: readonly string[], now: Date): Promise<number> {
  const rows = await db.outboundMailbox.findMany({ where: { address: { in: [...addresses] }, paused: false }, select: { address: true, domain: true, provider: true, readyAt: true, warmupStartedAt: true, dailyCap: true, paused: true } });
  const boxes = rows.map((r) => ({ ...r, domain: r.domain ?? mailDomain(r.address) }));
  const doms = await db.outboundDomain.findMany({ where: { domain: { in: [...new Set(boxes.map((b) => b.domain))] } }, select: { domain: true, dailyCap: true, paused: true } });
  return capacityOf(boxes, new Map(doms.map((d) => [d.domain, { cap: d.dailyCap, paused: d.paused }])), now);
}

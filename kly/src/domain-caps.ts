// Self-raising per-domain cold caps. Once per ET send day each auto-managed domain is graded on its last 7 days:
// clean (bounces < 3%, no complaints, warm-up spam < 10%) and busy (yesterday used >= 80% of the cap) -> +30%;
// unhealthy (bounces > 5%, any complaint, or warm-up spam > 20%) -> cut to 60%. Never above what its live mailboxes
// can send, never below the floor. Admin-fixed domains (capAuto=false) are left alone.
import { sendDayStart, spamPlacementRate } from "../../src/lib/ads/outbound/policy";
import type { Db } from "./db";

export const CAP_FLOOR = 20;
export const CAP_STEP = 1.3;
export const CAP_CUT = 0.6;
export const CAP_MIN_SAMPLE = 30;
const DAY_MS = 86_400_000;

export interface CapStats {
  cap: number;
  ceiling: number;
  sends7d: number;
  bounces7d: number;
  complaints7d: number;
  sentYesterday: number;
  warmupInbox: number;
  warmupSpam: number;
}

export function nextDomainCap(s: CapStats): { cap: number; why: string } | null {
  const bounceRate = s.sends7d ? s.bounces7d / s.sends7d : 0;
  const spam = spamPlacementRate(s.warmupInbox, s.warmupSpam);
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  const bad = s.complaints7d > 0 ? `${s.complaints7d} complaint(s)` : s.sends7d >= CAP_MIN_SAMPLE && bounceRate > 0.05 ? `bounces ${pct(bounceRate)}` : spam !== null && spam > 0.2 ? `warm-up spam ${pct(spam)}` : null;
  if (bad) {
    const cap = Math.max(CAP_FLOOR, Math.floor(s.cap * CAP_CUT));
    return cap < s.cap ? { cap, why: `cut: ${bad}` } : null;
  }
  const clean = s.sends7d >= CAP_MIN_SAMPLE && bounceRate < 0.03 && (spam === null || spam < 0.1);
  const busy = s.sentYesterday >= s.cap * 0.8;
  if (clean && busy) {
    const cap = Math.min(Math.max(s.ceiling, CAP_FLOOR), Math.ceil(s.cap * CAP_STEP));
    return cap > s.cap ? { cap, why: `raised: ${s.sends7d} sends, bounces ${pct(bounceRate)}, no complaints${spam === null ? "" : `, warm-up spam ${pct(spam)}`}, used ${s.sentYesterday}/${s.cap} yesterday` } : null;
  }
  return null;
}

type Box = { id: string; domain: string; row: { paused: boolean; dailyCap: number } };

export async function domainCapTick(db: Db, boxes: readonly Box[], now: Date): Promise<string[]> {
  const today = sendDayStart(now);
  const domains = [...new Set(boxes.map((b) => b.domain))];
  const due = await db.outboundDomain.findMany({ where: { domain: { in: domains }, capAuto: true, OR: [{ capCheckedAt: null }, { capCheckedAt: { lt: today } }] } });
  const out: string[] = [];
  const yStart = sendDayStart(new Date(today.getTime() - DAY_MS / 2));
  const since = new Date(now.getTime() - 7 * DAY_MS);
  for (const d of due) {
    const mine = boxes.filter((b) => b.domain === d.domain);
    const ids = mine.map((b) => b.id);
    const cold = { mailboxId: { in: ids }, dryRun: false, kind: "sequence" };
    const [sends7d, bounces7d, complaints7d, sentYesterday, wIn, wSpam] = await Promise.all([
      db.outboundSend.count({ where: { ...cold, sentAt: { gte: since } } }),
      db.outboundSend.count({ where: { ...cold, sentAt: { gte: since }, bounced: true } }),
      db.outboundSend.count({ where: { ...cold, sentAt: { gte: since }, complained: true } }),
      db.outboundSend.count({ where: { ...cold, sentAt: { gte: yStart, lt: today } } }),
      db.klyWarmupMessage.count({ where: { senderDomain: d.domain, sentAt: { gte: since }, placement: "inbox" } }),
      db.klyWarmupMessage.count({ where: { senderDomain: d.domain, sentAt: { gte: since }, placement: "spam" } }),
    ]);
    const ceiling = mine.filter((b) => !b.row.paused).reduce((a, b) => a + b.row.dailyCap, 0);
    const next = nextDomainCap({ cap: d.dailyCap, ceiling, sends7d, bounces7d, complaints7d, sentYesterday, warmupInbox: wIn, warmupSpam: wSpam });
    await db.outboundDomain.update({ where: { domain: d.domain }, data: { capCheckedAt: now, ...(next ? { dailyCap: next.cap } : {}) } });
    if (next) {
      await db.klyDecision.create({ data: { kind: "scale", summary: `${d.domain} daily cold cap ${d.dailyCap} -> ${next.cap} (${next.why}).`, data: { domain: d.domain, from: d.dailyCap, to: next.cap } } });
      out.push(`${d.domain}: ${d.dailyCap} -> ${next.cap}`);
    }
  }
  return out;
}

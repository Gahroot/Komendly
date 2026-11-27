// Reads the facts the ledger needs from Postgres (web page, daily engine job and script share it). Read-only.
// `db` is a PrismaClient; typed loosely on purpose so web, engine and scripts can all pass theirs.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { parseBeat, type SystemBeat } from "../../growth/systems";
import { CAPABILITIES } from "./inventory";
import { buildLedger, type EventFacts, type LedgerFacts } from "./ledger";

export const STATUS_EVENT = "system_status";
const DAY = 86_400_000;

export async function loadLedgerFacts(db: any, now = new Date()): Promise<LedgerFacts & { queue: { queued: number; running: number } }> {
  const names = [...new Set(CAPABILITIES.flatMap((c) => c.markers))];
  const since30 = new Date(now.getTime() - 30 * DAY), since7 = new Date(now.getTime() - 7 * DAY);
  const [flagRows, beatRows, g30, g7, ai, queued, running] = await Promise.all([
    db.adsFeatureFlag.findMany({ select: { key: true, enabled: true } }),
    db.engineHeartbeat.findMany({ where: { id: { startsWith: "system:" } }, select: { id: true, meta: true } }),
    db.adsEvent.groupBy({ by: ["name"], where: { name: { in: names }, createdAt: { gte: since30 } }, _count: { _all: true }, _max: { createdAt: true } }),
    db.adsEvent.groupBy({ by: ["name"], where: { name: { in: names }, createdAt: { gte: since7 } }, _count: { _all: true } }),
    db.adsEvent.findMany({ where: { name: "ai_call", createdAt: { gte: since30 } }, select: { props: true, createdAt: true }, take: 20_000 }).catch(() => []),
    db.adJob.count({ where: { status: "queued" } }).catch(() => 0),
    db.adJob.count({ where: { status: "running" } }).catch(() => 0),
  ]);
  const flags: Record<string, boolean> = {};
  for (const f of flagRows as Array<{ key: string; enabled: boolean }>) flags[f.key] = f.enabled;
  const beats: Record<string, SystemBeat> = {};
  for (const b of beatRows as Array<{ id: string; meta: unknown }>) beats[b.id] = parseBeat(b.meta);
  const events: Record<string, EventFacts> = {};
  for (const r of g30 as any[]) events[r.name] = { last: r._max.createdAt?.toISOString() ?? null, n7: 0, n30: r._count._all };
  for (const r of g7 as any[]) { const e = events[r.name]; if (e) e.n7 = r._count._all; }
  let aiCalls7d: Record<string, number> | undefined, aiCostMicros30d: Record<string, number> | undefined;
  if ((ai as any[]).length) {
    aiCalls7d = {}; aiCostMicros30d = {};
    for (const e of ai as Array<{ props: any; createdAt: Date }>) {
      const k = String(e.props?.system ?? "unattributed");
      aiCostMicros30d[k] = (aiCostMicros30d[k] ?? 0) + Number(e.props?.costMicros ?? 0);
      if (e.createdAt >= since7) aiCalls7d[k] = (aiCalls7d[k] ?? 0) + 1;
    }
  }
  return { now, flags, beats, events, aiCalls7d, aiCostMicros30d, queue: { queued: Number(queued), running: Number(running) } };
}

export async function loadLedger(db: any, now = new Date()) {
  const facts = await loadLedgerFacts(db, now);
  return { facts, ...buildLedger(facts) };
}

/** Compact props for the daily `system_status` AdsEvent. */
export function statusProps(l: ReturnType<typeof buildLedger>, day: string) {
  return {
    day, counts: l.counts, findings: l.findings.slice(0, 30),
    rows: l.rows.map((r) => ({ id: r.id, status: r.status, flagOn: r.flagOn, lastRunAt: r.lastRunAt, outputs30d: r.outputs30d, reason: r.reason })),
  };
}

/** Latest AdsEvent props by name (or null). Used by the ops page to read other workers' snapshots gracefully. */
export async function latestProps(db: any, name: string): Promise<{ props: any; at: Date } | null> {
  try {
    const r = await db.adsEvent.findFirst({ where: { name }, orderBy: { createdAt: "desc" }, select: { props: true, createdAt: true } });
    return r ? { props: r.props, at: r.createdAt } : null;
  } catch { return null; }
}

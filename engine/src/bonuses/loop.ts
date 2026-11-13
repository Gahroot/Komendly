// Ad Department bonus loop: finds live Ad Department workspaces whose bonuses are missing or due for a refresh
// (pure rules in contracts.ts) and enqueues bonus_generate jobs. Idempotent: one open job per (workspace, kind).
// Kill switch: ADS_BONUSES=0.
import { hasAdDepartment } from "../../../src/lib/ads/billing-config";
import { BONUS_JOB_TYPE, BONUS_KINDS, bonusDue, bonusesEnabled, type AdsBonusKind } from "../../../src/lib/ads/bonuses/contracts";
import type { Db } from "../db";
import { errMsg, log } from "../log";

export const BONUS_JOB_PRIORITY = 5;

/** Enqueue one bonus job unless one is already open for this workspace + kind. Returns the job id or null. */
export async function enqueueBonus(db: Db, workspaceId: string, kind: AdsBonusKind, reason: string): Promise<string | null> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bonus:${workspaceId}:${kind}`}))`;
    const open = await tx.adJob.findFirst({
      where: { type: BONUS_JOB_TYPE, workspaceId, status: { in: ["queued", "running"] }, payload: { path: ["kind"], equals: kind } },
      select: { id: true },
    });
    if (open) return null;
    await tx.adsBonus.upsert({
      where: { workspaceId_kind: { workspaceId, kind } },
      create: { workspaceId, kind, status: "pending", reason },
      update: { status: "pending", reason, error: null },
    });
    const job = await tx.adJob.create({ data: { type: BONUS_JOB_TYPE, workspaceId, payload: { kind, reason }, priority: BONUS_JOB_PRIORITY, maxAttempts: 3 } });
    return job.id;
  });
}

export async function bonusTick(db: Db, now: Date, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (!bonusesEnabled(env)) return 0;
  const candidates = await db.adsWorkspace.findMany({
    where: { adsPlan: "ad_department", suspendedAt: null },
    select: { id: true, adsPlan: true, subscriptionStatus: true, suspendedAt: true },
    orderBy: { id: "asc" },
  });
  let n = 0;
  for (const ws of candidates.filter((w) => hasAdDepartment(w))) {
    const [rows, brand, ads] = await Promise.all([
      db.adsBonus.findMany({ where: { workspaceId: ws.id }, select: { kind: true, status: true, generatedAt: true, updatedAt: true } }),
      db.brandProfile.findFirst({ where: { workspaceId: ws.id, runs: { some: { kind: { notIn: ["gift"] } } } }, select: { id: true } }),
      db.ad.aggregate({ where: { workspaceId: ws.id, status: "ready", run: { kind: { notIn: ["gift", "nurture"] } } }, _count: { _all: true }, _max: { createdAt: true } }),
    ]);
    for (const kind of BONUS_KINDS) {
      const row = rows.find((r) => r.kind === kind) ?? null;
      const reason = bonusDue(kind, row, { now, hasBrand: Boolean(brand), readyAdCount: ads._count._all, latestReadyAdAt: ads._max.createdAt });
      if (!reason) continue;
      if (await enqueueBonus(db, ws.id, kind, reason)) {
        n++;
        log("info", "bonus enqueued", { workspaceId: ws.id, kind, reason });
      }
    }
  }
  return n;
}

export function startBonusLoop(db: Db, everyMs = 10 * 60_000): () => void {
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    bonusTick(db, new Date())
      .catch((e) => log("warn", "bonus tick failed", { error: errMsg(e) }))
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 20_000);
  const t = setInterval(tick, everyMs);
  return () => {
    clearTimeout(first);
    clearInterval(t);
  };
}

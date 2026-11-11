// Auto-confirm runs whose 30s review window passed, and make sure every confirmed run
// has a plan job (the web app enqueues one on explicit confirm; this is idempotent).
import type { Db } from "../db";
import { enqueue, priorityFor } from "../queue/queue";
import { giftPolicy } from "./gift-policy";
import { finalizeConfirm } from "../../../src/lib/ads/trial-confirm";

export async function sweepConfirmations(db: Db, now: Date = new Date()): Promise<{ confirmed: number; planned: number }> {
  const due = await db.adRun.findMany({
    where: { status: "awaiting_confirm", confirmDeadline: { lt: now } },
    select: { id: true, workspaceId: true, userId: true, isTrial: true, kind: true, trialClaim: true },
    take: 100,
  });
  let confirmed = 0;
  for (const r of due) {
    const u = await db.adRun.updateMany({ where: { id: r.id, status: "awaiting_confirm" }, data: { status: "queued", confirmedAt: now } });
    if (u.count !== 1) continue;
    confirmed++;
    // Same bookkeeping as the web app's confirmRun: trial claim, trialUsedAt, run_confirmed.
    // Gift runs never claim a trial (they normally never reach awaiting_confirm at all).
    await finalizeConfirm(db, { ...r, isTrial: giftPolicy(r).claimTrial }, { auto: true, edited: [], now });
  }
  // Every queued run with no ads needs exactly one live/finished plan job.
  const queued = await db.adRun.findMany({
    where: { status: "queued", ads: { none: {} }, jobs: { none: { type: "plan", status: { in: ["queued", "running", "failed", "succeeded"] } } } },
    select: { id: true, workspaceId: true, isTrial: true },
    take: 100,
  });
  let planned = 0;
  for (const r of queued) {
    // Advisory lock per run so two engine replicas don't both enqueue.
    const created = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"plan:" + r.id}))`;
      const exists = await tx.adJob.findFirst({ where: { runId: r.id, type: "plan", status: { notIn: ["dead", "canceled"] } }, select: { id: true } });
      if (exists) return false;
      await enqueue(tx, { type: "plan", runId: r.id, workspaceId: r.workspaceId, priority: priorityFor(r.isTrial, 50) });
      return true;
    });
    if (created) planned++;
  }
  return { confirmed, planned };
}

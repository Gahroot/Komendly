// Run finalisation once every ad is terminal.
import type { Db } from "../db";

const TERMINAL = new Set(["ready", "failed_qc", "failed"]);

export async function maybeFinalizeRun(db: Db, runId: string, now: Date = new Date()): Promise<string | null> {
  const run = await db.adRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, workspaceId: true, userId: true, creditsReserved: true, confirmedAt: true, firstAdAt: true, isTrial: true },
  });
  if (!run || !["queued", "generating"].includes(run.status)) return null;
  const all = await db.ad.findMany({ where: { runId }, select: { status: true, qcReport: true } });
  const rep = (q: unknown) => (q && typeof q === "object" ? (q as { replacedBy?: unknown; replacementPending?: unknown }) : {});
  if (all.some((a) => rep(a.qcReport).replacementPending)) return null;
  // Replaced ads are superseded: they neither count as failures nor as deliverables.
  const ads = all.filter((a) => !rep(a.qcReport).replacedBy);
  if (ads.length === 0 || ads.some((a) => !TERMINAL.has(a.status))) return null;
  // An ad can look terminal while a render for it is still in flight (e.g. a stale-lock retry of an
  // older render finishing after the revision passed QC). Wait for that work: it will re-QC the ad.
  if (await hasInFlightAdWork(db, runId)) return null;
  const ready = ads.filter((a) => a.status === "ready").length;
  const status = ready === ads.length ? "completed" : ready > 0 ? "partial" : "failed";
  const jobCost = await db.adJob.aggregate({ where: { runId }, _sum: { costMicros: true } });
  const released = await db.creditLedger.aggregate({ where: { runId, reason: "release" }, _sum: { delta: true } });
  const creditsCharged = Math.max(0, run.creditsReserved - (released._sum.delta ?? 0));
  const res = await db.adRun.updateMany({
    where: { id: runId, status: { in: ["queued", "generating"] } },
    data: {
      status,
      completedAt: now,
      costMicros: jobCost._sum.costMicros ?? 0n,
      creditsCharged,
      ...(status === "failed" ? { error: "no ad passed QC" } : {}),
    },
  });
  if (res.count === 1) {
    await db.adsEvent.create({
      data: {
        name: "run_completed",
        workspaceId: run.workspaceId,
        userId: run.userId,
        runId,
        props: {
          status,
          ready,
          total: ads.length,
          isTrial: run.isTrial,
          totalMs: run.confirmedAt ? now.getTime() - run.confirmedAt.getTime() : null,
          costMicros: Number(jobCost._sum.costMicros ?? 0n),
        },
      },
    });
  }
  return status;
}

const AD_WORK = ["render_static", "render_motion", "qc"];
const OPEN_JOB = ["queued", "running", "failed"] as const; // failed = will retry

/**
 * True when renders/QC are still pending for this run's ads. QC jobs for ads that are already
 * terminal are ignored: that is the caller's own job (finalize runs inside the QC job).
 */
export async function hasInFlightAdWork(db: Db, runId: string): Promise<boolean> {
  const open = await db.adJob.findMany({
    where: { runId, type: { in: AD_WORK }, status: { in: [...OPEN_JOB] }, adId: { not: null } },
    select: { type: true, adId: true },
  });
  if (open.some((j) => j.type !== "qc")) return true;
  if (open.length === 0) return false;
  const ads = await db.ad.findMany({ where: { id: { in: open.flatMap((j) => (j.adId ? [j.adId] : [])) } }, select: { status: true } });
  return ads.some((a) => !TERMINAL.has(a.status));
}

/** Run-level failure (extract/plan died): release whatever is still reserved. */
export async function failRun(db: Db, runId: string, error: string): Promise<void> {
  const run = await db.adRun.findUnique({ where: { id: runId }, select: { workspaceId: true, creditsReserved: true, status: true } });
  if (!run || ["completed", "partial", "failed", "canceled"].includes(run.status)) return;
  await db.adRun.update({ where: { id: runId }, data: { status: "failed", error: error.slice(0, 2000), completedAt: new Date() } });
  const { releaseAdCredits } = await import("./credits");
  await releaseAdCredits(db, runId, "run", run.creditsReserved);
}

/** Re-sum AdRun.costMicros from all its jobs (extract, plan, render, qc). Called after each job records its cost. */
export async function syncRunCost(db: Db, runId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "AdRun" SET "costMicros" = COALESCE((SELECT SUM("costMicros") FROM "AdJob" WHERE "runId" = ${runId}), 0)
    WHERE id = ${runId}`;
}

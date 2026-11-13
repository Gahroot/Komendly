// Orphan reaper: stops abandoned work from competing with live runs.
// - Cancels queued/failed jobs whose run is failed/canceled or older than maxRunAgeHours.
// - Finalizes runs stuck in queued/generating past stuckRunHours: open jobs canceled,
//   unfinished ads failed with credits released, run marked partial (or failed if nothing is ready).
import type { Db } from "../db";
import { releaseForAd } from "../jobs/credits";
import { failRun, maybeFinalizeRun } from "../jobs/finalize";

export interface ReaperOptions {
  now: Date;
  maxRunAgeHours: number;
  stuckRunHours: number;
  /** Never touch these workspaces (e.g. a live benchmark). */
  excludeWorkspaceIds?: readonly string[];
  /** Only touch these workspaces (tests). */
  onlyWorkspaceIds?: readonly string[];
}

export interface ReaperResult {
  canceledJobs: number;
  finalizedRuns: number;
}

const OPEN_JOB = ["queued", "failed"] as const;
const UNFINISHED_AD = ["planned", "rendering", "qc"] as const;
const REAP_NOTE = "reaped: run abandoned or stuck";

export function reaperOptionsFromEnv(env: NodeJS.ProcessEnv, now: Date): ReaperOptions {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return { now, maxRunAgeHours: num(env.REAPER_RUN_MAX_AGE_HOURS, 24), stuckRunHours: num(env.REAPER_STUCK_RUN_HOURS, 1) };
}

function workspaceFilter(o: ReaperOptions) {
  return {
    ...(o.onlyWorkspaceIds ? { in: [...o.onlyWorkspaceIds] } : {}),
    ...(o.excludeWorkspaceIds?.length ? { notIn: [...o.excludeWorkspaceIds] } : {}),
  };
}

export async function reapOrphans(db: Db, o: ReaperOptions): Promise<ReaperResult> {
  const hours = (h: number) => new Date(o.now.getTime() - h * 3600_000);
  const ws = workspaceFilter(o);
  let finalizedRuns = 0;

  // 1) Stuck runs (also old runs that never got past extraction/confirm).
  const stuck = await db.adRun.findMany({
    where: {
      workspaceId: ws,
      OR: [
        { status: { in: ["queued", "generating"] }, OR: [{ confirmedAt: { lt: hours(o.stuckRunHours) } }, { confirmedAt: null, createdAt: { lt: hours(o.stuckRunHours) } }] },
        { status: { in: ["extracting", "awaiting_confirm"] }, createdAt: { lt: hours(o.maxRunAgeHours) } },
      ],
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  for (const run of stuck) {
    await db.adJob.updateMany({ where: { runId: run.id, status: { in: [...OPEN_JOB] } }, data: { status: "canceled", finishedAt: o.now, lockedBy: null, lockedAt: null } });
    const open = await db.ad.findMany({ where: { runId: run.id, status: { in: [...UNFINISHED_AD] } }, select: { id: true } });
    for (const ad of open) {
      const u = await db.ad.updateMany({ where: { id: ad.id, status: { in: [...UNFINISHED_AD] } }, data: { status: "failed" } });
      if (u.count === 1) await releaseForAd(db, ad.id);
    }
    const status = await maybeFinalizeRun(db, run.id, o.now);
    if (!status) await failRun(db, run.id, REAP_NOTE); // no ads, or a replacement still pending
    finalizedRuns++;
  }

  // 2) Open jobs belonging to dead or old runs.
  const jobs = await db.adJob.updateMany({
    where: {
      status: { in: [...OPEN_JOB] },
      // Old runs: only jobs that are old themselves. A fresh job on an old run is deliberate (QC revision of a
      // requeued ad, ops make-good) and used to be canceled within a minute.
      OR: [
        { run: { workspaceId: ws, status: { in: ["failed", "canceled"] } } },
        { run: { workspaceId: ws, createdAt: { lt: hours(o.maxRunAgeHours) } }, createdAt: { lt: hours(o.maxRunAgeHours) } },
      ],
    },
    data: { status: "canceled", finishedAt: o.now, lockedBy: null, lockedAt: null },
  });
  return { canceledJobs: jobs.count, finalizedRuns };
}

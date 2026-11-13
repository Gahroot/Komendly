// Postgres-backed job queue over the AdJob table.
// Claiming uses SELECT ... FOR UPDATE SKIP LOCKED so many workers never take the same row.
import type { Prisma } from "@prisma/client";
import type { Db } from "../db";
import type { JobType } from "../../../src/lib/ads/contracts";
import { retryDelayMs } from "./backoff";
import { AGE_CAP, AGE_STEP_SEC, DEFAULT_FAIRNESS, FIRST_AD_BOOST, QC_BOOST, START_BOOST, type FairnessTypes } from "./fairness";

export interface ClaimedJob {
  id: string;
  type: JobType;
  runId: string | null;
  adId: string | null;
  workspaceId: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  /** When the job became claimable (runAt) and when it was claimed: queue wait = claimedAt - readyAt. */
  readyAt?: Date;
  claimedAt?: Date;
}

/**
 * Atomically claim up to `limit` due jobs of the given types, in fairness order (see fairness.ts):
 * start work, then a run's first ad, then priority + aging.
 */
/** Scale/Agency "priority generation" boost in claim order. */
export const PRIORITY_PLAN_BOOST = 60;

export async function claimJobs(
  db: Db,
  workerId: string,
  types: readonly string[],
  limit: number,
  fairness: FairnessTypes = DEFAULT_FAIRNESS,
  /** Only claim jobs of this run (ops scripts such as make-gift.ts); null = any job. */
  scopeRunId: string | null = null,
): Promise<ClaimedJob[]> {
  if (limit <= 0 || types.length === 0) return [];
  const start = [...fairness.start];
  const render = [...fairness.render];
  const qc = [...fairness.qc];
  const rows = await db.$queryRaw<ClaimedJob[]>`
    UPDATE "AdJob" j SET status = 'running', "lockedBy" = ${workerId}, "lockedAt" = now(), attempts = j.attempts + 1
    WHERE j.id IN (
      SELECT c.id FROM "AdJob" c
      WHERE c.status IN ('queued', 'failed') AND c."runAt" <= now() AND c.type = ANY(${types as string[]})
        AND (${scopeRunId}::text IS NULL OR c."runId" = ${scopeRunId}::text)
      ORDER BY (
        c.priority
        + CASE WHEN c.type = ANY(${start}::text[]) AND NOT (c.payload ? 'replaceAdId') THEN ${START_BOOST} ELSE 0 END
        -- QC always outranks renders (short, gates readiness); the first ad's QC goes first of all QC.
        + CASE WHEN c.type = ANY(${qc}::text[]) THEN ${QC_BOOST}
            + CASE WHEN c."runId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Ad" a WHERE a."runId" = c."runId" AND a.status = 'ready')
              THEN ${FIRST_AD_BOOST} ELSE 0 END
          ELSE 0 END
        -- First-ad render: only while no ad of the run has got past planning and none is rendering.
        + CASE WHEN c.type = ANY(${render}::text[]) AND c."runId" IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM "Ad" a WHERE a."runId" = c."runId" AND a.status IN ('rendering', 'qc', 'ready'))
            AND NOT EXISTS (SELECT 1 FROM "AdJob" r WHERE r."runId" = c."runId" AND r.status = 'running' AND r.type = ANY(${render}::text[]))
          THEN ${FIRST_AD_BOOST} ELSE 0 END
        + LEAST(${AGE_CAP}, GREATEST(0, EXTRACT(EPOCH FROM (now() - c."runAt")) / ${AGE_STEP_SEC}))
        -- Priority generation (Scale, Agency): their jobs go ahead of other paid work (= 1 minute of aging).
        + CASE WHEN c."workspaceId" IS NOT NULL AND EXISTS (SELECT 1 FROM "AdsWorkspace" w WHERE w.id = c."workspaceId" AND w."adsPlan" IN ('scale', 'agency') AND w."subscriptionStatus" IN ('active', 'trialing', 'past_due')) THEN ${PRIORITY_PLAN_BOOST} ELSE 0 END
      ) DESC, c."runAt" ASC, c.id ASC
      LIMIT ${limit}
      FOR UPDATE OF c SKIP LOCKED
    )
    RETURNING j.id, j.type, j."runId", j."adId", j."workspaceId", j.payload, j.attempts, j."maxAttempts", j."runAt" AS "readyAt", j."lockedAt" AS "claimedAt"`;
  return rows;
}

export async function completeJob(db: Db, id: string, r: { result?: unknown; durationMs: number; costMicros: number }): Promise<void> {
  await db.adJob.update({
    where: { id },
    data: {
      status: "succeeded",
      result: (r.result ?? {}) as Prisma.InputJsonValue,
      durationMs: r.durationMs,
      costMicros: BigInt(Math.round(r.costMicros)),
      finishedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      lastError: null,
    },
  });
}

/** Record a failure; retry with backoff until maxAttempts, then mark 'dead'. Returns the new status. */
export async function failJob(
  db: Db,
  job: Pick<ClaimedJob, "id" | "attempts" | "maxAttempts">,
  error: string,
  r: { durationMs: number; costMicros: number; now?: Date; random?: () => number },
): Promise<"failed" | "dead"> {
  const now = r.now ?? new Date();
  const dead = job.attempts >= job.maxAttempts;
  await db.adJob.update({
    where: { id: job.id },
    data: {
      status: dead ? "dead" : "failed",
      lastError: error.slice(0, 4000),
      runAt: dead ? undefined : new Date(now.getTime() + retryDelayMs(job.attempts, { random: r.random })),
      durationMs: r.durationMs,
      costMicros: { increment: BigInt(Math.round(r.costMicros)) },
      finishedAt: dead ? now : null,
      lockedBy: null,
      lockedAt: null,
    },
  });
  return dead ? "dead" : "failed";
}

/** Put a job back without spending an attempt (e.g. provider not configured, shutdown). */
export async function releaseJob(db: Db, id: string, delayMs: number, note?: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "AdJob" SET status = 'queued', attempts = GREATEST(attempts - 1, 0), "lockedBy" = NULL, "lockedAt" = NULL,
      "runAt" = now() + (${delayMs}::int * interval '1 millisecond'), "lastError" = COALESCE(${note ?? null}, "lastError")
    WHERE id = ${id}`;
}

/**
 * A worker that died (deploy/restart, OOM) or lost its lease did not fail the job: give the attempt back
 * and count the interruption in payload.restarts instead. Only a job that keeps taking its worker down
 * (MAX_RESTARTS interruptions) is killed, so a poison job can't loop forever.
 */
export const MAX_RESTARTS = 3;

/** Jobs left 'running' by a crashed worker are re-queued without spending an attempt (dead after MAX_RESTARTS). */
export async function recoverStaleJobs(db: Db, staleMs: number, scope: { types?: readonly string[]; workspaceId?: string } = {}): Promise<number> {
  // scope narrows recovery (tests use it so they never touch other workers' rows); runners pass none.
  const types = scope.types ? [...scope.types] : null;
  const ws = scope.workspaceId ?? null;
  const n = await db.$executeRaw`
    UPDATE "AdJob" SET
      status = CASE WHEN COALESCE((payload->>'restarts')::int, 0) + 1 >= ${MAX_RESTARTS} THEN 'dead'::"AdJobStatus" ELSE 'queued'::"AdJobStatus" END,
      attempts = GREATEST(attempts - 1, 0),
      payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{restarts}', to_jsonb(COALESCE((payload->>'restarts')::int, 0) + 1)),
      "lockedBy" = NULL, "lockedAt" = NULL, "lastError" = 'stale lock recovered',
      "finishedAt" = CASE WHEN COALESCE((payload->>'restarts')::int, 0) + 1 >= ${MAX_RESTARTS} THEN now() ELSE NULL END
    WHERE status = 'running' AND "lockedAt" < now() - (${staleMs}::int * interval '1 millisecond')
      AND (${types}::text[] IS NULL OR type = ANY(${types}::text[]))
      AND (${ws}::text IS NULL OR "workspaceId" = ${ws}::text)`;
  return n;
}

/**
 * Jobs locked by a worker that is no longer alive (its EngineHeartbeat is older than deadMs, or it has none).
 * Single-replica deploys restart the container: without this, a job locked by the old container waits the
 * full stale-lock window (15 min) before anyone retries it. Never touches jobs of live workers.
 * Like recoverStaleJobs, the interrupted attempt is given back (dead only after MAX_RESTARTS restarts).
 */
export async function recoverOrphanedJobs(db: Db, selfWorkerId: string, deadMs: number): Promise<number> {
  return db.$executeRaw`
    UPDATE "AdJob" j SET
      status = CASE WHEN COALESCE((j.payload->>'restarts')::int, 0) + 1 >= ${MAX_RESTARTS} THEN 'dead'::"AdJobStatus" ELSE 'queued'::"AdJobStatus" END,
      attempts = GREATEST(j.attempts - 1, 0),
      payload = jsonb_set(COALESCE(j.payload, '{}'::jsonb), '{restarts}', to_jsonb(COALESCE((j.payload->>'restarts')::int, 0) + 1)),
      "lockedBy" = NULL, "lockedAt" = NULL, "lastError" = 'worker gone (restart): retried',
      "finishedAt" = CASE WHEN COALESCE((j.payload->>'restarts')::int, 0) + 1 >= ${MAX_RESTARTS} THEN now() ELSE NULL END
    WHERE j.status = 'running' AND j."lockedBy" IS NOT NULL AND j."lockedBy" <> ${selfWorkerId}
      AND NOT EXISTS (SELECT 1 FROM "EngineHeartbeat" h WHERE h.id = j."lockedBy" AND h."updatedAt" > now() - (${deadMs}::int * interval '1 millisecond'))`;
}

/** Engine-internal job types the web app never enqueues ("bonus": trial upsell, see jobs/bonus.ts). */
export type EngineJobType = "bonus";

export interface EnqueueInput {
  type: JobType | EngineJobType;
  runId?: string | null;
  adId?: string | null;
  workspaceId?: string | null;
  payload?: Record<string, unknown>;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueue(db: Db | Prisma.TransactionClient, j: EnqueueInput): Promise<string> {
  const row = await db.adJob.create({
    data: {
      type: j.type,
      runId: j.runId ?? null,
      adId: j.adId ?? null,
      workspaceId: j.workspaceId ?? null,
      payload: (j.payload ?? {}) as Prisma.InputJsonValue,
      priority: j.priority ?? 0,
      runAt: j.runAt ?? new Date(),
      maxAttempts: j.maxAttempts ?? 3,
    },
    select: { id: true },
  });
  return row.id;
}

/** Enqueue unless a live (queued/running/failed) job of the same type+run+ad exists. Idempotency helper. */
export async function enqueueOnce(db: Db, j: EnqueueInput): Promise<string | null> {
  const existing = await db.adJob.findFirst({
    where: { type: j.type, runId: j.runId ?? null, adId: j.adId ?? null, status: { in: ["queued", "running", "failed"] } },
    select: { id: true },
  });
  if (existing) return null;
  return enqueue(db, j);
}

/** Paid runs outrank trial runs. */
export function priorityFor(isTrial: boolean, base = 0): number {
  return base + (isTrial ? 0 : 100);
}

/**
 * Lease renewal: a live worker refreshes lockedAt for the jobs it is running, so stale-lock
 * recovery only ever takes jobs whose worker stopped renewing (crashed/killed), never a healthy
 * long render. Only rows still locked by this worker are touched.
 */
export async function renewLeases(db: Db, workerId: string, jobIds: readonly string[]): Promise<number> {
  if (jobIds.length === 0) return 0;
  return db.$executeRaw`
    UPDATE "AdJob" SET "lockedAt" = now()
    WHERE id = ANY(${[...jobIds]}) AND status = 'running' AND "lockedBy" = ${workerId}`;
}

/** Fencing check: true while this worker still holds the job's lock. */
export async function holdsLock(db: Db | Prisma.TransactionClient, jobId: string, workerId: string): Promise<boolean> {
  const row = await db.adJob.findUnique({ where: { id: jobId }, select: { status: true, lockedBy: true } });
  return row?.status === "running" && row.lockedBy === workerId;
}


// Nurture runs (AdRun.kind = "nurture"): the monthly "Ozzy made you a new ad" for an unpaid trial user's own site.
// Started by the lifecycle loop when a fresh_m* email is due; reuses the trial run's extraction (no crawl), so it
// goes straight to queued (the confirm sweeper enqueues the plan job). 1 static, no credits, max 3 attempts and a
// cost cap (see gift-policy.ts). On finalize the ready ad is locked (bonus contract: visualBrief.locked = true,
// bonusKind "fresh") and the email loop adds its blurred "preview" asset before sending.
import type { Prisma } from "@prisma/client";
import type { Db } from "../db";
import { NURTURE_COST_CAP_MICROS, NURTURE_KIND, nurtureFirstTryMicros } from "./gift-policy";

export const NURTURE_STARTED = "nurture_started";
/** A nurture run still running after this long is given up on (the email goes out without the ad). */
export const NURTURE_MAX_WAIT_MS = 6 * 3_600_000;

/** Lock every ready ad of a finished nurture run (idempotent). */
export async function lockNurtureAds(db: Db, runId: string): Promise<number> {
  const ads = await db.ad.findMany({ where: { runId, status: "ready" }, select: { id: true, visualBrief: true } });
  let n = 0;
  for (const a of ads) {
    const vb = (a.visualBrief && typeof a.visualBrief === "object" ? a.visualBrief : {}) as Record<string, unknown>;
    if (vb.locked === true) continue;
    await db.ad.update({ where: { id: a.id }, data: { visualBrief: { ...vb, locked: true, bonusKind: "fresh" } as Prisma.InputJsonValue } });
    n++;
  }
  return n;
}

export type NurtureState =
  | { state: "none" }
  | { state: "pending"; runId: string }
  | { state: "ready"; runId: string; adId: string; headline: string }
  | { state: "failed"; runId: string | null; reason: string };

/** The nurture run started for (workspace, email kind), if any, and where it stands. */
export async function nurtureState(db: Db, workspaceId: string, kind: string, now: Date): Promise<NurtureState> {
  const ev = await db.adsEvent.findFirst({
    where: { name: NURTURE_STARTED, workspaceId, props: { path: ["kind"], equals: kind } },
    orderBy: { createdAt: "desc" },
    select: { runId: true, createdAt: true, props: true },
  });
  if (!ev) return { state: "none" };
  const skipped = (ev.props as Record<string, unknown> | null)?.skipped;
  if (typeof skipped === "string") return { state: "failed", runId: null, reason: skipped };
  if (!ev.runId) return { state: "failed", runId: null, reason: "no run" };
  const run = await db.adRun.findUnique({ where: { id: ev.runId }, select: { status: true } });
  if (!run) return { state: "failed", runId: null, reason: "run deleted" };
  if (run.status === "completed" || run.status === "partial") {
    const ad = await db.ad.findFirst({ where: { runId: ev.runId, status: "ready" }, orderBy: { index: "asc" }, select: { id: true, headline: true, visualBrief: true } });
    const locked = (ad?.visualBrief as { locked?: unknown } | null)?.locked === true;
    return ad && locked ? { state: "ready", runId: ev.runId, adId: ad.id, headline: ad.headline } : { state: "failed", runId: ev.runId, reason: "no locked ad" };
  }
  if (run.status === "failed" || run.status === "canceled") return { state: "failed", runId: ev.runId, reason: `run ${run.status}` };
  if (now.getTime() - ev.createdAt.getTime() > NURTURE_MAX_WAIT_MS) return { state: "failed", runId: ev.runId, reason: "timed out" };
  return { state: "pending", runId: ev.runId };
}

/**
 * Start the nurture run for one fresh_m* email (once per workspace + kind: advisory lock + AdsEvent nurture_started).
 * Skips (recording why) when there is no reusable trial extraction or the estimate exceeds the cost cap.
 */
export async function startNurtureRun(
  db: Db,
  c: { userId: string; workspaceId: string; trialRunId: string | null },
  kind: string,
): Promise<NurtureState> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nurture:${c.workspaceId}:${kind}`}))`;
    const prior = await tx.adsEvent.findFirst({ where: { name: NURTURE_STARTED, workspaceId: c.workspaceId, props: { path: ["kind"], equals: kind } }, select: { runId: true } });
    if (prior) return prior.runId ? { state: "pending" as const, runId: prior.runId } : { state: "failed" as const, runId: null, reason: "skipped" };
    const trial = c.trialRunId ? await tx.adRun.findUnique({ where: { id: c.trialRunId }, select: { url: true, extraction: true, brandProfileId: true, resolvedGoal: true, goal: true } }) : null;
    const skip = !trial?.extraction || !trial.brandProfileId ? "no trial extraction" : nurtureFirstTryMicros() > NURTURE_COST_CAP_MICROS ? "over cost cap" : null;
    if (skip || !trial) {
      await tx.adsEvent.create({ data: { name: NURTURE_STARTED, workspaceId: c.workspaceId, userId: c.userId, props: { kind, skipped: skip ?? "no trial" } } });
      return { state: "failed" as const, runId: null, reason: skip ?? "no trial" };
    }
    const now = new Date();
    const run = await tx.adRun.create({
      data: {
        workspaceId: c.workspaceId,
        userId: c.userId,
        brandProfileId: trial.brandProfileId,
        url: trial.url,
        goal: trial.goal,
        resolvedGoal: trial.resolvedGoal,
        status: "queued",
        confirmedAt: now,
        isTrial: false,
        kind: NURTURE_KIND,
        extraction: trial.extraction as Prisma.InputJsonValue,
        staticCount: 1,
        motionCount: 0,
        creditsReserved: 0,
        ratios: ["4:5"],
        awarenessMix: { solution_aware: 1 },
      },
      select: { id: true },
    });
    await tx.adsEvent.create({ data: { name: NURTURE_STARTED, workspaceId: c.workspaceId, userId: c.userId, runId: run.id, props: { kind, runId: run.id } } });
    return { state: "pending" as const, runId: run.id };
  });
}

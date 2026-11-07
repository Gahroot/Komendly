// Replacement ads: when an ad ends failed_qc/failed, plan a new distinct ad in its place so the
// user still gets the promised count. Replaced ads keep their failure status but carry
// qcReport.replacedBy (web gallery hides them) and their credits move to the replacement.
import type { Prisma } from "@prisma/client";
import type { Db } from "../db";
import { enqueue, priorityFor } from "../queue/queue";
import { releaseForAd } from "./credits";

/** Max ads (originals + replacements) per kind per run. */
export function attemptCap(kind: "static" | "motion", run: { staticCount: number; motionCount: number; isTrial?: boolean }): number {
  return kind === "static" ? run.staticCount + (run.isTrial ? 5 : 3) : run.motionCount * 2;
}

export function qcObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** True when a replacement was queued; otherwise the ad's credits are released. */
export async function requestReplacement(db: Db, adId: string, feedback: string): Promise<boolean> {
  const ad = await db.ad.findUnique({ where: { id: adId }, include: { run: true } });
  if (!ad) return false;
  const report = qcObj(ad.qcReport);
  if (report.replacedBy || report.replacementPending) return true;
  const run = ad.run;
  const total = await db.ad.count({ where: { runId: run.id, kind: ad.kind } });
  const live = ["queued", "generating"].includes(run.status);
  if (!live || total >= attemptCap(ad.kind, run)) {
    await releaseForAd(db, adId);
    return false;
  }
  await db.$transaction(async (tx) => {
    await tx.ad.update({ where: { id: adId }, data: { qcReport: { ...report, replacementPending: true } as Prisma.InputJsonValue } });
    await enqueue(tx, {
      type: "plan",
      runId: run.id,
      workspaceId: run.workspaceId,
      priority: priorityFor(run.isTrial, 40),
      payload: { replaceAdId: adId, feedback: feedback.slice(0, 2000) },
    });
  });
  return true;
}

/** Replacement could not be produced: clear the pending flag and release credits. */
export async function abandonReplacement(db: Db, adId: string): Promise<void> {
  const ad = await db.ad.findUnique({ where: { id: adId }, select: { qcReport: true } });
  if (!ad) return;
  const r = qcObj(ad.qcReport);
  delete r.replacementPending;
  await db.ad.update({ where: { id: adId }, data: { qcReport: r as Prisma.InputJsonValue } });
  await releaseForAd(db, adId);
}

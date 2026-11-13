// Replacement ads: when an ad ends failed_qc/failed, plan a new distinct ad in its place so the
// user still gets the promised count. Replaced ads keep their failure status but carry
// qcReport.replacedBy (web gallery hides them) and their credits move to the replacement.
import type { Prisma } from "@prisma/client";
import type { Db } from "../db";
import { enqueue, priorityFor } from "../queue/queue";
import { releaseForAd } from "./credits";
import { GIFT_ATTEMPT_CAP, isGiftRun, isNurtureRun, isWeeklyRun, NURTURE_ATTEMPT_CAP, nurtureOverBudget, weeklyOverBudget } from "./gift-policy";
import { isLocked, trialAttemptFactor, withinFillWindow } from "./trial-fill";

/** Max ads (originals + replacements) per kind per run. */
export function attemptCap(kind: "static" | "motion", run: { staticCount: number; motionCount: number; isTrial?: boolean; kind?: string | null }, env: NodeJS.ProcessEnv = process.env): number {
  if (isGiftRun(run)) return kind === "static" ? Math.max(run.staticCount, GIFT_ATTEMPT_CAP) : 0;
  if (isNurtureRun(run)) return kind === "static" ? NURTURE_ATTEMPT_CAP : 0;
  if (!run.isTrial) return kind === "static" ? run.staticCount + 3 : run.motionCount * 2;
  // Trials must deliver the full pack: budget = factor x promised (default 2x), never below the old +5.
  const f = trialAttemptFactor(env);
  return kind === "static" ? Math.max(run.staticCount + 5, Math.ceil(run.staticCount * f)) : Math.max(run.motionCount * 2, Math.ceil(run.motionCount * (f + 1)));
}

/** Ads of a kind that count toward the run's attempt budget (locked bonus ads excluded). */
export async function packAttempts(db: Db, runId: string, kind: "static" | "motion"): Promise<number> {
  const rows = await db.ad.findMany({ where: { runId, kind }, select: { visualBrief: true } });
  return rows.filter((r) => !isLocked(r.visualBrief)).length;
}

export function qcObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** True when a replacement was queued; otherwise the ad's credits are released. */
export async function requestReplacement(db: Db, adId: string, feedback: string, now: Date = new Date()): Promise<boolean> {
  const ad = await db.ad.findUnique({ where: { id: adId }, include: { run: true } });
  if (!ad) return false;
  // Locked bonus ads hold no credits and are never replaced.
  if (isLocked(ad.visualBrief)) return false;
  const report = qcObj(ad.qcReport);
  if (report.replacedBy || report.replacementPending) return true;
  // A hedge (replacement started in parallel on the first QC fail) already covers this ad: adopt it.
  if (await adoptHedge(db, adId)) return true;
  const run = ad.run;
  const total = await packAttempts(db, run.id, ad.kind);
  const live = ["queued", "generating"].includes(run.status);
  const overBudget = (isNurtureRun(run) && nurtureOverBudget(run.costMicros)) || (isWeeklyRun(run) && weeklyOverBudget(run.costMicros, ad.kind));
  if (!live || overBudget || total >= attemptCap(ad.kind, run) || !withinFillWindow(run, now)) {
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

// ---- Hedged replacements (trials) ----
// On a trial static's first QC fail the re-render AND a replacement plan run in parallel, so a slot that keeps
// failing does not serialise render -> QC -> re-render x2 -> replan. The hedge ad carries visualBrief.hedgeOf; if
// the original passes later both count (surplus ad, free on trials); if it ends failed, the hedge becomes its
// replacement (qcReport.replacedBy). Both sides take the same advisory lock so the link is never missed.

/** Advisory-lock key shared by hedge creation and adoption for one original ad. */
export function hedgeLockKey(adId: string): string {
  return `hedge:${adId}`;
}

/** True when the original should get a hedge now (pure part; budget/window checked by the caller). */
export function wantsHedge(o: { isTrial: boolean; freeRun: boolean; kind: string; locked: boolean; qcAttempts: number; enabled: boolean }): boolean {
  return o.enabled && o.isTrial && !o.freeRun && o.kind === "static" && !o.locked && o.qcAttempts === 0;
}

/** Budget + window + run state for a hedge (DB reads). */
export async function canHedge(db: Db, run: { id: string; status: string; staticCount: number; motionCount: number; isTrial: boolean; kind: string | null; confirmedAt: Date | null; createdAt: Date }, now: Date): Promise<boolean> {
  if (!["queued", "generating"].includes(run.status) || !withinFillWindow(run, now)) return false;
  const ads = await db.ad.findMany({ where: { runId: run.id, kind: "static" }, select: { status: true, visualBrief: true, qcReport: true } });
  const pack = ads.filter((a) => !isLocked(a.visualBrief));
  if (pack.length >= attemptCap("static", run)) return false;
  const ready = pack.filter((a) => a.status === "ready" && !qcObj(a.qcReport).replacedBy).length;
  return ready < run.staticCount;
}

/**
 * Original ended failed: link it to its hedge. Returns true when a hedge exists (replacedBy set) or is still
 * being planned (replacementPending set; the hedge plan links it when it lands, or abandons it if it dies).
 */
export async function adoptHedge(db: Db, adId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hedgeLockKey(adId)}))`;
    const ad = await tx.ad.findUnique({ where: { id: adId }, select: { runId: true, qcReport: true } });
    if (!ad) return false;
    const hedge = await tx.ad.findFirst({ where: { runId: ad.runId, visualBrief: { path: ["hedgeOf"], equals: adId } }, select: { id: true } });
    const report = qcObj(ad.qcReport);
    if (hedge) {
      delete report.replacementPending;
      await tx.ad.update({ where: { id: adId }, data: { qcReport: { ...report, replacedBy: hedge.id } as Prisma.InputJsonValue } });
      return true;
    }
    const planning = await tx.adJob.findFirst({
      where: { runId: ad.runId, type: "plan", status: { in: ["queued", "running", "failed"] }, AND: [{ payload: { path: ["replaceAdId"], equals: adId } }, { payload: { path: ["hedge"], equals: true } }] },
      select: { id: true },
    });
    if (!planning) return false;
    await tx.ad.update({ where: { id: adId }, data: { qcReport: { ...report, replacementPending: true } as Prisma.InputJsonValue } });
    return true;
  });
}

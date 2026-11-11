// Run finalisation once every ad is terminal.
import type { Db } from "../db";
import { enqueueOnce } from "../queue/queue";
import { errMsg, log } from "../log";
import { finishGift } from "./gift";
import { giftPolicy, isGiftRun, isNurtureRun } from "./gift-policy";
import { lockNurtureAds } from "./nurture";
import { rewardReferralForRun } from "./referral";
import { BONUS_PRIORITY, bonusEnabled, earlyDoneEnabled, earlyPackStatus, isLocked, motionInBackground, settledShortfall, settleExtra, settleFillEnabled, withinFillWindow } from "./trial-fill";
import type { Prisma } from "@prisma/client";
import { enqueue, priorityFor } from "../queue/queue";

const TERMINAL = new Set(["ready", "failed_qc", "failed"]);

export async function maybeFinalizeRun(db: Db, runId: string, now: Date = new Date()): Promise<string | null> {
  const run = await db.adRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, workspaceId: true, userId: true, creditsReserved: true, confirmedAt: true, createdAt: true, firstAdAt: true, isTrial: true, kind: true, staticCount: true, motionCount: true },
  });
  if (!run || !["queued", "generating"].includes(run.status)) return null;
  // Locked bonus ads (trial upsell) are extras: they never gate or count toward the run's pack.
  const all = (await db.ad.findMany({ where: { runId }, select: { id: true, kind: true, status: true, qcReport: true, visualBrief: true } })).filter((a) => !isLocked(a.visualBrief));
  const rep = (q: unknown) => (q && typeof q === "object" ? (q as { replacedBy?: unknown; replacementPending?: unknown }) : {});
  // Trial packs are done once the promised ads are ready: surplus/hedge/re-render work (and the motion ad, by
  // default) continues in the background instead of holding the user-visible completion.
  const packAds = all.map((a) => ({ kind: a.kind, status: a.status, replaced: Boolean(rep(a.qcReport).replacedBy), pending: Boolean(rep(a.qcReport).replacementPending) }));
  const trialPack = run.isTrial && !isGiftRun(run) && !isNurtureRun(run) && earlyDoneEnabled();
  let early = trialPack ? earlyPackStatus(run, packAds, motionInBackground()) : null;
  if (trialPack && !early) {
    // Every static slot settled but the pack is short: fill now (never wait for the motion ad or completion).
    const missing = settledShortfall(run, packAds);
    if (missing !== null && missing > 0 && !(await hasOpenStaticWork(db, runId))) {
      if (settleFillEnabled() && (await settleFill(db, run, all, missing, now)) > 0) return null;
      if (packAds.some((a) => a.kind === "static" && !a.replaced && a.status === "ready")) early = "partial";
    }
  }
  // Replaced ads are superseded: they neither count as failures nor as deliverables.
  const ads = all.filter((a) => !rep(a.qcReport).replacedBy);
  let status: "completed" | "partial" | "failed";
  if (early) {
    status = early;
  } else {
    if (all.some((a) => rep(a.qcReport).replacementPending)) return null;
    if (ads.length === 0 || ads.some((a) => !TERMINAL.has(a.status))) return null;
    // An ad can look terminal while a render for it is still in flight (e.g. a stale-lock retry of an
    // older render finishing after the revision passed QC). Wait for that work: it will re-QC the ad.
    if (await hasInFlightAdWork(db, runId)) return null;
    const r = ads.filter((a) => a.status === "ready").length;
    status = r === ads.length ? "completed" : r > 0 ? "partial" : "failed";
  }
  const ready = ads.filter((a) => a.status === "ready").length;
  const inFlight = ads.filter((a) => !TERMINAL.has(a.status)).length;
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
    log("info", "run completed", { runId, status, ready, total: ads.length, inFlight, early: early !== null, isTrial: run.isTrial, timeToCompleteMs: run.confirmedAt ? now.getTime() - run.confirmedAt.getTime() : null });
    // Trial upsell: generate locked bonus ads only now, after the free pack is final (never delays it).
    if (giftPolicy(run).bonus && ready > 0 && bonusEnabled()) {
      await enqueueOnce(db, { type: "bonus", runId, workspaceId: run.workspaceId, priority: BONUS_PRIORITY }).catch(() => undefined);
    }
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
          kind: run.kind,
          totalMs: run.confirmedAt ? now.getTime() - run.confirmedAt.getTime() : null,
          // Early pack completion: promised ads ready while `inFlight` ads continue in the background.
          early: early !== null,
          inFlight,
          costMicros: Number(jobCost._sum.costMicros ?? 0n),
        },
      },
    });
    if (isNurtureRun(run) && ready > 0) await lockNurtureAds(db, runId).catch((e: unknown) => log("warn", "nurture lock failed", { runId, error: errMsg(e) }));
    if (isGiftRun(run)) await finishGift(db, runId, ready).catch((e: unknown) => log("warn", "gift finish failed", { runId, error: errMsg(e) }));
    // Give 10, get 10: a referred workspace's trial that delivered ads rewards the referrer.
    if (run.isTrial && ready > 0) await rewardReferralForRun(db, { id: runId, workspaceId: run.workspaceId }, now).catch((e: unknown) => log("warn", "referral reward failed", { runId, error: errMsg(e) }));
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
  if (open.length === 0) return false;
  const ads = await db.ad.findMany({ where: { id: { in: open.flatMap((j) => (j.adId ? [j.adId] : [])) } }, select: { id: true, status: true, visualBrief: true } });
  const byId = new Map(ads.map((a) => [a.id, a]));
  const pack = open.filter((j) => !isLocked(byId.get(j.adId ?? "")?.visualBrief));
  if (pack.some((j) => j.type !== "qc")) return true;
  return pack.some((j) => !TERMINAL.has(byId.get(j.adId ?? "")?.status ?? ""));
}

/** Run-level failure (extract/plan died): release whatever is still reserved. */
export async function failRun(db: Db, runId: string, error: string): Promise<void> {
  const run = await db.adRun.findUnique({ where: { id: runId }, select: { workspaceId: true, creditsReserved: true, status: true, kind: true } });
  if (!run || ["completed", "partial", "failed", "canceled"].includes(run.status)) return;
  await db.adRun.update({ where: { id: runId }, data: { status: "failed", error: error.slice(0, 2000), completedAt: new Date() } });
  if (isGiftRun(run)) await finishGift(db, runId, 0).catch((e: unknown) => log("warn", "gift finish failed", { runId, error: errMsg(e) }));
  const { releaseAdCredits } = await import("./credits");
  await releaseAdCredits(db, runId, "run", run.creditsReserved);
}

/** Re-sum AdRun.costMicros from all its jobs (extract, plan, render, qc). Called after each job records its cost. */
export async function syncRunCost(db: Db, runId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE "AdRun" SET "costMicros" = COALESCE((SELECT SUM("costMicros") FROM "AdJob" WHERE "runId" = ${runId}), 0)
    WHERE id = ${runId}`;
}

/** Open static render/QC jobs or any open plan job (replacement/hedge being written) of the run. */
async function hasOpenStaticWork(db: Db, runId: string): Promise<boolean> {
  const open = await db.adJob.findMany({ where: { runId, type: { in: ["plan", "render_static", "qc"] }, status: { in: [...OPEN_JOB] } }, select: { type: true, adId: true } });
  if (open.some((j) => j.type === "plan")) return true;
  const ids = open.flatMap((j) => (j.adId ? [j.adId] : []));
  if (ids.length === 0) return false;
  const ads = new Map((await db.ad.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true, status: true, visualBrief: true } })).map((a) => [a.id, a]));
  // QC jobs of already-terminal ads are ignored: that is the caller's own job (finalize runs inside QC).
  return open.some((j) => {
    const a = ads.get(j.adId ?? "");
    return a?.kind === "static" && !isLocked(a.visualBrief) && !(j.type === "qc" && TERMINAL.has(a.status));
  });
}

/**
 * Settle fill: queue typographic replacements for up to `missing` failed static leaves, within the fill window and
 * attemptCap + settleExtra(). Serialised per run (advisory lock); returns how many were queued.
 */
async function settleFill(
  db: Db,
  run: { id: string; workspaceId: string; isTrial: boolean; kind: string | null; staticCount: number; motionCount: number; confirmedAt: Date | null; createdAt: Date },
  ads: Array<{ id: string; kind: string; status: string; qcReport: unknown; visualBrief: unknown }>,
  missing: number,
  now: Date,
): Promise<number> {
  if (!withinFillWindow(run, now)) return 0;
  const { attemptCap, qcObj } = await import("./replace");
  const statics = ads.filter((a) => a.kind === "static");
  const left = attemptCap("static", run) + settleExtra() - statics.length;
  const leaves = statics.filter((a) => ["failed", "failed_qc"].includes(a.status) && !qcObj(a.qcReport).replacedBy && !qcObj(a.qcReport).replacementPending);
  const pick = leaves.slice(0, Math.max(0, Math.min(missing, left)));
  if (pick.length === 0) return 0;
  const n = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"settle:" + run.id}))`;
    let queued = 0;
    for (const a of pick) {
      const cur = await tx.ad.findUnique({ where: { id: a.id }, select: { qcReport: true } });
      const r = qcObj(cur?.qcReport);
      if (r.replacedBy || r.replacementPending) continue;
      await tx.ad.update({ where: { id: a.id }, data: { qcReport: { ...r, replacementPending: true } as Prisma.InputJsonValue } });
      await enqueue(tx, { type: "plan", runId: run.id, workspaceId: run.workspaceId, priority: priorityFor(run.isTrial, 45), payload: { replaceAdId: a.id, settle: true, feedback: "pack short after all slots settled: safe typographic fill" } });
      queued++;
    }
    return queued;
  });
  if (n > 0) log("info", "settle fill", { runId: run.id, missing, queued: n, budgetLeft: left });
  return n;
}

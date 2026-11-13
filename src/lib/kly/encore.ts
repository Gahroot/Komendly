// Kly "encore": when a real person opens an outbound gift page (the JS view beacon, so link scanners that only
// follow the email link never trigger it), Ozzy draws 2 more ads for them live. It's a second AdRun kind=gift on
// the same website, made by the engine's normal gift pipeline (no credits, not a trial), linked via AdsGift.extraRunId.
// Codex usage is spent only on prospects who actually look. Idempotent: one encore per gift.
import { prisma } from "@/lib/prisma";
import { TRIAL_AWARENESS_MIX, TRIAL_RATIOS } from "@/lib/ads/contracts";

export const ENCORE_STATIC = 2;
/** Above trials (0), below paid runs (10): someone is watching the page. */
export const ENCORE_PRIORITY = 5;
/** Safety valve on Codex usage if something goes wrong (e.g. a bot that runs JS). */
export const ENCORE_DAILY_CAP = 150;

/** Gift on click (Kly gift_timing "on-click"): the email had no ad, so the first real page view starts a 3-ad run. */
export const ON_CLICK_STATIC = 3;
/** Safety valve on Codex usage for on-click runs (real clicks only; a JS-running bot is the risk). */
export const ON_CLICK_DAILY_CAP = 400;

export type EncoreState = "none" | "drawing" | "done" | "failed";

export function encoreState(run: { status: string } | null | undefined, extraRunId: string | null): EncoreState {
  if (!extraRunId) return "none";
  if (!run) return "drawing";
  if (["completed", "partial"].includes(run.status)) return "done";
  if (["failed", "canceled"].includes(run.status)) return "failed";
  return "drawing";
}

/** Start the encore for an outbound gift if eligible. Returns the new run id, or null (not eligible / already started). */
export async function startGiftEncore(token: string, now: Date = new Date()): Promise<string | null> {
  const gift = await prisma.adsGift.findUnique({ where: { token }, select: { id: true, source: true, status: true, runId: true, extraRunId: true, recipientUrl: true } });
  if (!gift || gift.source !== "outbound" || gift.status !== "ready" || !gift.runId || gift.extraRunId) return null;
  const since = new Date(now.getTime() - 86_400_000);
  if ((await prisma.adsGift.count({ where: { source: "outbound", extraRunId: { not: null }, updatedAt: { gte: since } } })) >= ENCORE_DAILY_CAP) return null;
  const src = await prisma.adRun.findUnique({ where: { id: gift.runId }, select: { workspaceId: true, userId: true, url: true, staticCount: true } });
  // On-click runs already draw 3; no encore on top.
  if (!src || src.staticCount >= ON_CLICK_STATIC) return null;
  const runId = await prisma.$transaction(async (tx) => {
    const run = await tx.adRun.create({
      data: { workspaceId: src.workspaceId, userId: src.userId, url: src.url, goal: "auto", status: "extracting", isTrial: false, kind: "gift", staticCount: ENCORE_STATIC, motionCount: 0, creditsReserved: 0, ratios: TRIAL_RATIOS, awarenessMix: TRIAL_AWARENESS_MIX },
      select: { id: true },
    });
    const claimed = await tx.adsGift.updateMany({ where: { id: gift.id, extraRunId: null }, data: { extraRunId: run.id } });
    if (claimed.count !== 1) throw new EncoreRace();
    // Same row enqueueJob writes, inside the transaction so a crash can't leave a run without its extract job.
    await tx.adJob.create({ data: { type: "extract", runId: run.id, workspaceId: src.workspaceId, payload: { url: src.url }, priority: ENCORE_PRIORITY, maxAttempts: 3 } });
    return run.id;
  }).catch((e: unknown) => {
    if (e instanceof EncoreRace) return null;
    throw e;
  });
  return runId;
}

class EncoreRace extends Error {}

/** On-click outbound gift: the first real page view starts the gift run (3 ads, drawn live). Idempotent; null when the
 * gift already has a run, isn't an outbound gift, or the daily safety cap is hit. */
export async function startOnClickRun(token: string, now: Date = new Date()): Promise<string | null> {
  const gift = await prisma.adsGift.findUnique({ where: { token }, select: { id: true, source: true, status: true, runId: true, recipientUrl: true, senderWorkspaceId: true, senderUserId: true } });
  if (!gift || gift.source !== "outbound" || gift.runId || gift.status !== "pending") return null;
  const since = new Date(now.getTime() - 86_400_000);
  if ((await prisma.adRun.count({ where: { kind: "gift", staticCount: ON_CLICK_STATIC, createdAt: { gte: since } } })) >= ON_CLICK_DAILY_CAP) {
    console.error("[kly] on-click daily cap reached", { token });
    return null;
  }
  return prisma.$transaction(async (tx) => {
    const run = await tx.adRun.create({
      data: { workspaceId: gift.senderWorkspaceId, userId: gift.senderUserId, url: gift.recipientUrl, goal: "auto", status: "extracting", isTrial: false, kind: "gift", staticCount: ON_CLICK_STATIC, motionCount: 0, creditsReserved: 0, ratios: TRIAL_RATIOS, awarenessMix: TRIAL_AWARENESS_MIX },
      select: { id: true },
    });
    const claimed = await tx.adsGift.updateMany({ where: { id: gift.id, runId: null }, data: { runId: run.id, status: "generating" } });
    if (claimed.count !== 1) throw new EncoreRace();
    await tx.adJob.create({ data: { type: "extract", runId: run.id, workspaceId: gift.senderWorkspaceId, payload: { url: gift.recipientUrl }, priority: ENCORE_PRIORITY, maxAttempts: 3 } });
    return run.id;
  }).catch((e: unknown) => {
    if (e instanceof EncoreRace) return null;
    throw e;
  });
}

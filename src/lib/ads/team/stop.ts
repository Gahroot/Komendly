// Stop paths for Ozzy's team (billing webhook, self-refund, admin suspend, Meta disconnect). Light imports only (prisma +
// events) so the billing webhook doesn't pull in auth or Meta code.
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { TEAM_EVENTS, TEAM_PAUSE_JOB } from "./contracts";

type Db = PrismaClient;

/** team_hired once per workspace (billing webhook: paid Ad Department / Agency checkout). */
export async function recordTeamHired(workspaceId: string, userId: string, props: Record<string, unknown>, db: Db = prisma): Promise<void> {
  const seen = await db.adsEvent.findFirst({ where: { name: TEAM_EVENTS.hired, workspaceId }, select: { id: true } });
  if (!seen) await trackAdsEvent(TEAM_EVENTS.hired, { workspaceId, userId, props });
}

/** Immediate pause job for the engine (deduped while one is waiting). */
export async function enqueueTeamPause(db: Db, workspaceId: string, reason: string): Promise<string> {
  const waiting = await db.adJob.findFirst({ where: { type: TEAM_PAUSE_JOB, workspaceId, status: "queued" }, select: { id: true } });
  if (waiting) return waiting.id;
  const job = await db.adJob.create({ data: { type: TEAM_PAUSE_JOB, workspaceId, payload: { workspaceId, reason }, priority: 100, maxAttempts: 5 } });
  return job.id;
}

/**
 * Billing / admin / disconnect stop: record the intent on the mandate and enqueue an immediate pause. Idempotent
 * (webhook retries): a stopped mandate never goes back to paused, and a waiting pause job is reused.
 */
export async function stopTeamFor(workspaceId: string, o: { status: "stopped" | "paused"; reason: string; summary: string }, db: Db = prisma): Promise<boolean> {
  const m = await db.marketingMandate.findUnique({ where: { workspaceId }, select: { status: true } });
  if (!m) return false;
  if (m.status !== "stopped" && m.status !== o.status) await db.marketingMandate.update({ where: { workspaceId }, data: { status: o.status } });
  const alreadyNoted = m.status === o.status || m.status === "stopped";
  await enqueueTeamPause(db, workspaceId, o.reason);
  if (!alreadyNoted) await db.marketingAction.create({ data: { workspaceId, role: "launch", kind: "service_paused", summary: o.summary } });
  return true;
}

/**
 * Meta disconnect: mark needs_reconnect and pause first, then wait (briefly) for the engine to finish the pause while the
 * token still works. The caller revokes afterwards.
 */
export async function pauseTeamBeforeDisconnect(workspaceId: string, o: { db?: Db; waitMs?: number } = {}): Promise<void> {
  const db = o.db ?? prisma;
  const m = await db.marketingMandate.findUnique({ where: { workspaceId }, select: { campaignId: true, state: true } });
  if (!m) return;
  const reason = "Meta is disconnected. Reconnect it so the team can keep working.";
  await db.marketingMandate.update({ where: { workspaceId }, data: { state: "needs_reconnect", stateReason: reason } });
  const jobId = await enqueueTeamPause(db, workspaceId, "meta_disconnect");
  if (m.state !== "needs_reconnect") await db.marketingAction.create({ data: { workspaceId, role: "director", kind: "needs_reconnect", summary: "Meta was disconnected, so I asked the team to pause your ads before the connection closed." } });
  if (!m.campaignId) return; // nothing running on Meta to pause
  const deadline = Date.now() + (o.waitMs ?? 20_000);
  while (Date.now() < deadline) {
    const job = await db.adJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job || job.status === "succeeded" || job.status === "dead" || job.status === "canceled") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn(`[ads/team] pause before disconnect not finished in time (workspace ${workspaceId}); revoking anyway, Meta spend cap still holds`);
}

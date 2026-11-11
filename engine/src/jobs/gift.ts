// Gift run bookkeeping: keeps AdsGift.status in sync with its AdRun and emits gift_ready / gift_failed.
import type { Db } from "../db";

/** pending -> generating when the gift run's extraction starts. */
export async function markGiftGenerating(db: Db, runId: string): Promise<void> {
  await db.adsGift.updateMany({ where: { runId, status: "pending" }, data: { status: "generating" } });
}

/** Run reached a terminal status: ready when >= 1 ad is ready, else failed. Idempotent (only from pending/generating). */
export async function finishGift(db: Db, runId: string, ready: number): Promise<"ready" | "failed" | null> {
  const gift = await db.adsGift.findUnique({ where: { runId }, select: { id: true, senderWorkspaceId: true, senderUserId: true } });
  if (!gift) return null;
  const jobCost = await db.adJob.aggregate({ where: { runId }, _sum: { costMicros: true } });
  const status = ready > 0 ? "ready" : "failed";
  const res = await db.adsGift.updateMany({
    where: { id: gift.id, status: { in: ["pending", "generating"] } },
    data: { status, costMicros: jobCost._sum.costMicros ?? 0n },
  });
  if (res.count !== 1) return null;
  await db.adsEvent.create({
    data: {
      name: status === "ready" ? "gift_ready" : "gift_failed",
      workspaceId: gift.senderWorkspaceId,
      userId: gift.senderUserId,
      runId,
      props: { giftId: gift.id, runId, ready },
    },
  });
  return status;
}

// Guards against two renders racing on one ad (e.g. a retry of an old render finishing after the
// QC revision passed): a render must be dropped if the ad is already done, if a newer render job
// exists for it, or if this worker no longer holds the job's lock.
import type { Prisma } from "@prisma/client";
import type { Db } from "../db";
import { holdsLock } from "../queue/queue";

const RENDERABLE = new Set(["planned", "rendering"]);
const RENDER_TYPES = ["render_static", "render_motion"];

export async function supersededReason(
  db: Db | Prisma.TransactionClient,
  job: { id: string; adId: string | null },
  workerId: string,
): Promise<string | null> {
  if (!job.adId) return null;
  const [ad, self] = await Promise.all([
    db.ad.findUnique({ where: { id: job.adId }, select: { status: true } }),
    db.adJob.findUnique({ where: { id: job.id }, select: { createdAt: true } }),
  ]);
  if (!ad) return "ad not found";
  if (!RENDERABLE.has(ad.status)) return `ad status ${ad.status}`;
  if (self) {
    const newer = await db.adJob.findFirst({
      where: { adId: job.adId, type: { in: RENDER_TYPES }, id: { not: job.id }, createdAt: { gt: self.createdAt }, status: { notIn: ["canceled"] } },
      select: { id: true },
    });
    if (newer) return `superseded by render ${newer.id}`;
  }
  if (!(await holdsLock(db, job.id, workerId))) return "lock lost";
  return null;
}

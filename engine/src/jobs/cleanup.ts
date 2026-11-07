// cleanup job: reap orphaned jobs/stuck runs, then delete expired run objects
// (AdAsset.expiresAt < now). Never brand keys.
import { isBrandKey } from "../storage/keys";
import { reapOrphans, reaperOptionsFromEnv } from "../queue/reaper";
import type { JobContext } from "./context";

export async function cleanupJob(ctx: JobContext): Promise<unknown> {
  const { db, storage } = ctx;
  const reaped = await reapOrphans(db, reaperOptionsFromEnv(process.env, ctx.now()));
  let deleted = 0;
  for (let round = 0; round < 20; round++) {
    const rows = await db.adAsset.findMany({ where: { expiresAt: { lt: ctx.now() } }, select: { id: true, storageKey: true }, take: 500 });
    if (rows.length === 0) break;
    const keys = rows.map((r) => r.storageKey).filter((k) => !isBrandKey(k));
    if (keys.length) await storage.deleteRunObjects(keys);
    await db.adAsset.deleteMany({ where: { id: { in: rows.filter((r) => !isBrandKey(r.storageKey)).map((r) => r.id) } } });
    // Brand-key rows are never deleted: just clear their TTL.
    await db.adAsset.updateMany({ where: { id: { in: rows.filter((r) => isBrandKey(r.storageKey)).map((r) => r.id) } }, data: { expiresAt: null } });
    deleted += keys.length;
  }
  return { deleted, ...reaped };
}

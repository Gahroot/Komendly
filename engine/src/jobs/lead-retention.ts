// Lead retention (prd.md R6): delete MetaLead rows 180 days after receipt and clear PII of owner-deleted leads.
// Idempotent and cheap, so it can run on every cleanup tick. Wire it with one line in cleanupJob (cleanup.ts):
//   const leads = await purgeLeadsJob(ctx).catch(() => null);
// The Railway image needs `COPY src/lib/ads/leads/retention.ts src/lib/ads/leads/retention.ts` in engine/Dockerfile
// (pure TS, no imports).
import { purgeOldLeads } from "../../../src/lib/ads/leads/retention";
import type { JobContext } from "./context";

export async function purgeLeadsJob(ctx: Pick<JobContext, "db" | "now">): Promise<{ deleted: number; scrubbed: number }> {
  return purgeOldLeads(ctx.now(), ctx.db);
}

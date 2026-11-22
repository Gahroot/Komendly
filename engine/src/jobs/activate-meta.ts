// activate_meta job: turns ON one campaign Komendly published (its ads, ad sets, then the campaign). Spends money:
// enqueued only by POST /api/ads/meta/activate after the user confirmed, behind the meta_activate flag.
import { activateCampaign, activationTargets } from "../../../src/lib/ads/meta/core/activate";
import { createMetaPublisher } from "../../../src/lib/ads/meta/core/factory";
import type { MetaPublisher } from "../../../src/lib/ads/meta/core/types";
import { PermanentJobError, type JobContext } from "./context";
import { workspaceToken } from "./publish-meta";

export async function handleActivateMeta(ctx: JobContext, deps: { publisher?: MetaPublisher } = {}): Promise<unknown> {
  const { job, db } = ctx;
  const campaignId = typeof job.payload.campaignId === "string" ? job.payload.campaignId : "";
  if (!job.runId || !job.workspaceId || !campaignId) throw new PermanentJobError("activate_meta needs runId, workspaceId and campaignId");
  const rows = await db.metaPublish.findMany({
    where: { campaignId, status: "published", ad: { runId: job.runId, workspaceId: job.workspaceId } },
    select: { campaignId: true, adSetId: true, metaAdId: true, status: true },
  });
  const targets = activationTargets(rows, campaignId);
  if (!targets) throw new PermanentJobError("Nothing Komendly published in this campaign");

  let publisher = deps.publisher;
  if (!publisher) {
    const token = await workspaceToken(db, job.workspaceId, ctx.now().getTime());
    publisher = createMetaPublisher({ mode: token.mode, accessToken: token.accessToken, graphVersion: process.env.META_GRAPH_VERSION || undefined });
  }
  try {
    await activateCampaign(publisher, targets, ctx.signal);
  } finally {
    await publisher.close?.();
  }
  const requestedBy = typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : undefined;
  await db.adsEvent.create({
    data: { name: "meta_activated", workspaceId: job.workspaceId, userId: requestedBy, runId: job.runId,
      props: { jobId: job.id, campaignId, adSets: targets.adSetIds.length, ads: targets.adIds.length } },
  }).catch(() => undefined);
  return { campaignId, adSets: targets.adSetIds.length, ads: targets.adIds.length };
}

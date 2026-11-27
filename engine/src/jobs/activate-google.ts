// activate_google job: "Start my ads" (enable campaign + ad group + ads) or pause one campaign Komendly created.
// Spends the customer's money once enabled: enqueued only by POST /api/ads/google/activate after the user confirmed.
import { setCampaignState } from "../../../src/lib/ads/google/core/publish";
import type { GoogleAdsClient } from "../../../src/lib/ads/google/core/client";
import { PermanentJobError, type JobContext } from "./context";
import { workspaceGoogle } from "./google-auth";

export async function handleActivateGoogle(ctx: JobContext, deps: { client?: GoogleAdsClient } = {}): Promise<unknown> {
  const { job, db } = ctx;
  const publishId = typeof job.payload.publishId === "string" ? job.payload.publishId : "";
  const action = job.payload.action === "pause" ? "pause" : job.payload.action === "enable" ? "enable" : null;
  if (!job.workspaceId || !publishId || !action) throw new PermanentJobError("activate_google needs workspaceId, publishId and action");
  const row = await db.googlePublish.findFirst({ where: { id: publishId, workspaceId: job.workspaceId, status: "published" } });
  if (!row?.campaignResource) throw new PermanentJobError("Nothing Komendly published for this campaign");
  const client = deps.client ?? (await workspaceGoogle(db, job.workspaceId)).client;
  const adResources = Array.isArray(row.adResources) ? (row.adResources as unknown[]).filter((x): x is string => typeof x === "string") : [];
  await setCampaignState(client, row.customerId, { campaignResource: row.campaignResource, adGroupResource: row.adGroupResource, adResources }, action, ctx.signal);
  await db.googlePublish.update({ where: { id: row.id }, data: { serving: action === "enable" ? "enabled" : "paused" } });
  const requestedBy = typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : undefined;
  await db.adsEvent.create({ data: { name: action === "enable" ? "google_activated" : "google_paused", workspaceId: job.workspaceId, userId: requestedBy, runId: row.runId, props: { jobId: job.id, publishId } } }).catch(() => undefined);
  return { publishId, action };
}

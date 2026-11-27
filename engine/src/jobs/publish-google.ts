// publish_google job: creates PAUSED Search / Demand Gen campaigns on the customer's Google Ads account and records
// GooglePublish rows. maxAttempts 1 (never retried): a partial publish is rolled back by the core instead.
import sharp from "sharp";
import { parseGooglePublishPayload, publishToGoogle, type GooglePublishStore, type PublishAdInput } from "../../../src/lib/ads/google/core/publish";
import type { GoogleAdsClient } from "../../../src/lib/ads/google/core/client";
import { idOf, type CampaignKind } from "../../../src/lib/ads/google/core/types";
import type { Db } from "../db";
import type { Storage } from "../storage/s3";
import { PermanentJobError, type JobContext } from "./context";
import { workspaceGoogle } from "./google-auth";

const isQcPass = (r: unknown) => !!r && typeof r === "object" && (r as { pass?: unknown }).pass === true;

export function prismaGoogleStore(db: Db, storage: Storage, o: { runId: string; workspaceId: string; jobId: string; customerId: string; adIds: string[] }): GooglePublishStore {
  return {
    async loadAds(adIds) {
      const ads = await db.ad.findMany({ where: { id: { in: adIds }, runId: o.runId, workspaceId: o.workspaceId }, include: { assets: true }, orderBy: { index: "asc" } });
      return ads.map((a): PublishAdInput => ({
        id: a.id, headline: a.headline, body: a.body, cta: a.cta, eligible: a.status === "ready" && isQcPass(a.qcReport),
        ratios: a.assets.filter((x) => x.mime.startsWith("image/")).map((x) => x.ratio),
      }));
    },
    async image(adId, ratio) {
      const asset = await db.adAsset.findFirst({ where: { adId, ratio, mime: { startsWith: "image/" } } });
      if (!asset) return null;
      // Google takes PNG/JPEG/GIF up to 5 MB: re-encode as JPEG to stay well under it.
      const bytes = await sharp(await storage.get(asset.storageKey)).jpeg({ quality: 88 }).toBuffer();
      return { adId, ratio, bytes: new Uint8Array(bytes), mime: "image/jpeg" };
    },
    async logo() {
      const run = await db.adRun.findUnique({ where: { id: o.runId }, select: { brandProfile: { select: { logoKey: true } }, extraction: true } });
      const key = run?.brandProfile?.logoKey ?? ((run?.extraction ?? {}) as { logoKey?: string | null }).logoKey ?? null;
      if (!key) return null;
      try {
        // Square 512x512 on white (Demand Gen logos must be 1:1 and >= 128px).
        const out = await sharp(await storage.get(key)).flatten({ background: "#ffffff" })
          .resize(448, 448, { fit: "contain", background: "#ffffff" }).extend({ top: 32, bottom: 32, left: 32, right: 32, background: "#ffffff" }).png().toBuffer();
        return new Uint8Array(out);
      } catch {
        return null;
      }
    },
    async setResult(kind, r) {
      const data = {
        status: r.status, error: r.error ?? null, campaignName: r.campaignName ?? undefined,
        campaignResource: r.campaignResource ?? null, campaignId: idOf(r.campaignResource ?? null), budgetResource: r.budgetResource ?? null,
        adGroupResource: r.adGroupResource ?? null, adResources: (r.adResources ?? []) as object, serving: "paused",
      };
      const u = await db.googlePublish.updateMany({ where: { jobId: o.jobId, kind }, data });
      if (u.count === 0) await db.googlePublish.create({ data: { ...data, kind, jobId: o.jobId, runId: o.runId, workspaceId: o.workspaceId, customerId: o.customerId, adIds: o.adIds } });
    },
  };
}

export async function handlePublishGoogle(ctx: JobContext, deps: { client?: GoogleAdsClient; store?: GooglePublishStore } = {}): Promise<unknown> {
  const { job, db } = ctx;
  if (!job.runId || !job.workspaceId) throw new PermanentJobError("publish_google needs runId and workspaceId");
  let payload;
  try {
    payload = parseGooglePublishPayload(job.payload);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Invalid payload";
    await db.googlePublish.updateMany({ where: { jobId: job.id }, data: { status: "failed", error } });
    throw new PermanentJobError(error);
  }
  const store = deps.store ?? prismaGoogleStore(db, ctx.storage, { runId: job.runId, workspaceId: job.workspaceId, jobId: job.id, customerId: payload.customerId, adIds: payload.adIds });
  const run = await db.adRun.findUnique({ where: { id: job.runId }, select: { url: true, extraction: true } });
  const businessName = ((run?.extraction ?? {}) as { brandName?: string }).brandName || (run ? new URL(run.url).hostname.replace(/^www\./, "") : "Your business");
  let client = deps.client;
  let currency = "USD";
  try {
    const g = await workspaceGoogle(db, job.workspaceId);
    client ??= g.client;
    currency = g.conn.currency || currency;
    if (g.conn.customerId && g.conn.customerId !== payload.customerId) throw new PermanentJobError("Publish account doesn't match the connected Google Ads account");
  } catch (e) {
    if (!deps.client) {
      const error = e instanceof Error ? e.message : String(e);
      for (const kind of payload.campaigns as CampaignKind[]) await store.setResult(kind, { status: "failed", error });
      throw e instanceof PermanentJobError ? e : new PermanentJobError(error);
    }
  }
  const summary = await publishToGoogle({ client: client!, store, payload, businessName, currency, now: ctx.now, signal: ctx.signal });
  const requestedBy = typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : undefined;
  await db.adsEvent.create({
    data: { name: "google_published", workspaceId: job.workspaceId, userId: requestedBy, runId: job.runId, props: { jobId: job.id, customerId: payload.customerId, ...summary } as object },
  }).catch(() => undefined);
  if (!summary.created.length) throw new PermanentJobError(`Google publish failed: ${summary.failed.join(", ")}`);
  return summary;
}

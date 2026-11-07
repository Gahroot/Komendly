// publish_meta job: creates PAUSED campaign/ad sets/ads on Meta for selected ads and records MetaPublish rows.
// Never retried automatically (maxAttempts 1) so a partial publish can't create duplicates.
import type { Ratio } from "../../../src/lib/ads/contracts";
import { decryptToken, encryptToken, tokenKey } from "../../../src/lib/ads/meta/core/crypto";
import { createMetaPublisher } from "../../../src/lib/ads/meta/core/factory";
import { META_MCP_TOKEN_ENDPOINT_FALLBACK, refreshMcpToken } from "../../../src/lib/ads/meta/core/oauth";
import { parsePublishPayload, publishToMeta, type PublishStore, type PublishableAd } from "../../../src/lib/ads/meta/core/publish";
import type { MetaPublisher, StoredMetaToken } from "../../../src/lib/ads/meta/core/types";
import type { Db } from "../db";
import type { Storage } from "../storage/s3";
import { PermanentJobError, type JobContext } from "./context";

const VIDEO_URL_TTL_SECONDS = 3600;

function isQcPass(r: unknown): boolean {
  return !!r && typeof r === "object" && (r as { pass?: unknown }).pass === true;
}

export function prismaPublishStore(db: Db, storage: Storage, o: { runId: string; workspaceId: string; jobId: string }): PublishStore {
  return {
    async loadRun() {
      const run = await db.adRun.findUniqueOrThrow({ where: { id: o.runId } });
      const ex = (run.extraction ?? {}) as { landingPage?: string; brandName?: string };
      const corr = (run.corrections ?? {}) as { landingPage?: string };
      return { goal: run.resolvedGoal ?? run.goal, landingPage: corr.landingPage ?? ex.landingPage ?? run.url, brandName: ex.brandName ?? new URL(run.url).hostname };
    },
    async loadAds(adIds) {
      const ads = await db.ad.findMany({ where: { id: { in: adIds }, runId: o.runId, workspaceId: o.workspaceId }, include: { assets: true }, orderBy: { index: "asc" } });
      return ads.map((a): PublishableAd => ({
        id: a.id, headline: a.headline, body: a.body, cta: a.cta,
        eligible: a.status === "ready" && isQcPass(a.qcReport),
        assets: a.assets.map((x) => ({ ratio: x.ratio, storageKey: x.storageKey, mime: x.mime })),
      }));
    },
    async media(ad, asset) {
      const filename = `komendly-${ad.id}-${asset.ratio.replace(":", "x")}`;
      if (asset.mime.startsWith("video/")) {
        const poster = (await db.adAsset.findFirst({ where: { adId: ad.id, ratio: "poster" } }))?.storageKey;
        return {
          kind: "video", filename,
          fileUrl: await storage.presignGet(asset.storageKey, VIDEO_URL_TTL_SECONDS),
          thumbnailUrl: await storage.presignGet(poster ?? asset.storageKey, VIDEO_URL_TTL_SECONDS),
        };
      }
      return { kind: "image", filename, mime: asset.mime, bytes: new Uint8Array(await storage.get(asset.storageKey)) };
    },
    async setResult(adId, ratio, r) {
      const data = { status: r.status, metaAdId: r.metaAdId ?? null, campaignId: r.campaignId ?? null, adSetId: r.adSetId ?? null, error: r.error ?? null };
      const u = await db.metaPublish.updateMany({ where: { jobId: o.jobId, adId, ratio }, data });
      if (u.count === 0) await db.metaPublish.create({ data: { ...data, adId, ratio, jobId: o.jobId } });
    },
  };
}

async function workspaceToken(db: Db, workspaceId: string, now: number): Promise<StoredMetaToken> {
  const conn = await db.metaConnection.findUnique({ where: { workspaceId } });
  if (!conn) throw new PermanentJobError("Meta account is not connected");
  const key = tokenKey(process.env.ADS_TOKEN_KEY);
  let token = JSON.parse(decryptToken(conn.encryptedToken, key)) as StoredMetaToken;
  if (token.expiresAt && token.expiresAt - now < 5 * 60 * 1000) {
    if (token.mode !== "mcp" || !process.env.META_APP_ID) throw new PermanentJobError("Meta connection expired; reconnect");
    token = await refreshMcpToken(META_MCP_TOKEN_ENDPOINT_FALLBACK, process.env.META_APP_ID, token, now);
    await db.metaConnection.update({ where: { workspaceId }, data: { encryptedToken: encryptToken(JSON.stringify(token), key), tokenExpiresAt: token.expiresAt ? new Date(token.expiresAt) : null } });
  }
  return token;
}

export async function handlePublishMeta(ctx: JobContext, deps: { publisher?: MetaPublisher; store?: PublishStore } = {}): Promise<unknown> {
  const { job, db } = ctx;
  if (!job.runId || !job.workspaceId) throw new PermanentJobError("publish_meta needs runId and workspaceId");
  let payload;
  try {
    payload = parsePublishPayload(job.payload);
  } catch (e) {
    throw new PermanentJobError(e instanceof Error ? e.message : "Invalid payload");
  }
  const store = deps.store ?? prismaPublishStore(db, ctx.storage, { runId: job.runId, workspaceId: job.workspaceId, jobId: job.id });
  let publisher = deps.publisher;
  if (!publisher) {
    try {
      const token = await workspaceToken(db, job.workspaceId, ctx.now().getTime());
      publisher = createMetaPublisher({ mode: token.mode, accessToken: token.accessToken, graphVersion: process.env.META_GRAPH_VERSION || undefined });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      for (const adId of payload.adIds) for (const ratio of payload.ratios as Ratio[]) await store.setResult(adId, ratio, { status: "failed", error });
      throw e instanceof PermanentJobError ? e : new PermanentJobError(error);
    }
  }
  try {
    const summary = await publishToMeta({ publisher, store, payload, now: ctx.now, signal: ctx.signal });
    const requestedBy = typeof job.payload.requestedBy === "string" ? job.payload.requestedBy : undefined;
    await db.adsEvent.create({
      data: { name: "meta_published", workspaceId: job.workspaceId, userId: requestedBy, runId: job.runId,
        props: { jobId: job.id, adAccountId: payload.adAccountId, campaignId: summary.campaignId, published: summary.published, failed: summary.failed, mode: publisher.mode } },
    }).catch(() => undefined);
    return summary;
  } finally {
    await publisher.close?.();
  }
}

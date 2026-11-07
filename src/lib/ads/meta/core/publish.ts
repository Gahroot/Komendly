// Publish orchestration (framework-free): one PAUSED campaign per job, one PAUSED ad set per
// placement group, one PAUSED ad per (ad x ratio). Persistence goes through PublishStore.
import { RATIOS, type Ratio } from "../../contracts";
import { adsManagerUrl, objectiveForGoal, placementGroupForRatio, type PlacementGroup } from "./mapping";
import type { MetaMedia, MetaPublisher } from "./types";

export interface PublishJobPayload {
  adIds: string[];
  adAccountId: string;
  pageId: string;
  /** Daily budget in the ad account's minor currency units. Optional; everything stays PAUSED regardless. */
  budget?: number;
  ratios: Ratio[];
  countries?: string[];
}

export interface PublishableAsset { ratio: string; storageKey: string; mime: string }
export interface PublishableAd {
  id: string;
  headline: string;
  body: string | null;
  cta: string | null;
  eligible: boolean; // status ready + QC passed
  assets: PublishableAsset[];
}

export interface PublishStore {
  loadRun(): Promise<{ goal: string | null; landingPage: string; brandName: string }>;
  loadAds(adIds: string[]): Promise<PublishableAd[]>;
  media(ad: PublishableAd, asset: PublishableAsset): Promise<MetaMedia>;
  setResult(adId: string, ratio: Ratio, r: { status: "published" | "failed"; metaAdId?: string; campaignId?: string; adSetId?: string; error?: string }): Promise<void>;
}

export interface PublishSummary { campaignId: string | null; adsManagerUrl: string; published: number; failed: number }

export const DEFAULT_DAILY_BUDGET_MINOR = 500;

export function parsePublishPayload(raw: Record<string, unknown>): PublishJobPayload {
  const adIds = Array.isArray(raw.adIds) ? raw.adIds.filter((x): x is string => typeof x === "string") : [];
  const ratios = Array.isArray(raw.ratios) ? RATIOS.filter((r) => (raw.ratios as unknown[]).includes(r)) : [];
  if (!adIds.length || !ratios.length || typeof raw.adAccountId !== "string" || typeof raw.pageId !== "string") {
    throw new Error("Invalid publish_meta payload");
  }
  const budget = typeof raw.budget === "number" && raw.budget > 0 ? Math.round(raw.budget) : undefined;
  const countries = Array.isArray(raw.countries) ? raw.countries.filter((c): c is string => typeof c === "string" && /^[A-Z]{2}$/.test(c)) : undefined;
  return { adIds, adAccountId: raw.adAccountId, pageId: raw.pageId, budget, ratios, countries: countries?.length ? countries : undefined };
}

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

export async function publishToMeta(o: {
  publisher: MetaPublisher;
  store: PublishStore;
  payload: PublishJobPayload;
  now: () => Date;
  signal?: AbortSignal;
}): Promise<PublishSummary> {
  const { publisher, store, payload, signal } = o;
  const run = await store.loadRun();
  const objective = objectiveForGoal(run.goal);
  const ads = await store.loadAds(payload.adIds);
  const work = ads.flatMap((ad) =>
    payload.ratios.flatMap((ratio) => {
      const asset = ad.assets.find((a) => a.ratio === ratio);
      return asset ? [{ ad, ratio, asset }] : [];
    }));
  let published = 0;
  let failed = 0;
  const fail = async (adId: string, ratio: Ratio, error: string, campaignId?: string) => {
    failed++;
    await store.setResult(adId, ratio, { status: "failed", error, campaignId });
  };

  for (const ad of ads) {
    for (const ratio of payload.ratios) {
      if (!ad.eligible) await fail(ad.id, ratio, "Ad is not ready or did not pass QC");
      else if (!ad.assets.some((a) => a.ratio === ratio)) await fail(ad.id, ratio, `No ${ratio} file for this ad`);
    }
  }
  const eligibleWork = work.filter((w) => w.ad.eligible);
  if (!eligibleWork.length) return { campaignId: null, adsManagerUrl: adsManagerUrl(payload.adAccountId), published, failed };

  const stamp = o.now().toISOString().slice(0, 10);
  let campaignId: string;
  try {
    campaignId = await publisher.createCampaign(payload.adAccountId, { name: `Komendly · ${run.brandName} · ${stamp}`, objective }, signal);
  } catch (e) {
    for (const w of eligibleWork) await fail(w.ad.id, w.ratio, errText(e));
    return { campaignId: null, adsManagerUrl: adsManagerUrl(payload.adAccountId), published, failed };
  }

  const adSets = new Map<PlacementGroup, Promise<string>>();
  const adSetFor = (group: PlacementGroup) => {
    let p = adSets.get(group);
    if (!p) {
      p = publisher.createAdSet(payload.adAccountId, {
        name: `Komendly · ${group === "feed" ? "Feed" : "Stories & Reels"} · ${stamp}`,
        campaignId, objective, group,
        dailyBudgetMinor: payload.budget ?? DEFAULT_DAILY_BUDGET_MINOR,
        countries: payload.countries ?? ["US"],
      }, signal);
      adSets.set(group, p);
    }
    return p;
  };

  for (const w of eligibleWork) {
    try {
      const adSetId = await adSetFor(placementGroupForRatio(w.ratio));
      const uploaded = await publisher.uploadMedia(payload.adAccountId, await store.media(w.ad, w.asset), signal);
      const { adId } = await publisher.createAd(payload.adAccountId, {
        name: `${w.ad.headline.slice(0, 60)} · ${w.ratio}`,
        adSetId, pageId: payload.pageId, objective,
        copy: { headline: w.ad.headline, body: w.ad.body, cta: w.ad.cta, link: run.landingPage },
        media: uploaded,
      }, signal);
      published++;
      await store.setResult(w.ad.id, w.ratio, { status: "published", metaAdId: adId, campaignId, adSetId });
    } catch (e) {
      await fail(w.ad.id, w.ratio, errText(e), campaignId);
    }
  }
  return { campaignId, adsManagerUrl: adsManagerUrl(payload.adAccountId, campaignId), published, failed };
}

// /ad-examples gallery data: consented ads grouped by industry (classified at read time, nothing stored). Cached 1h.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PUBLIC_FEATURE_STATUSES, pickFeatureAsset, publicFeatureImageUrl } from "./feature-assets";
import { INDUSTRIES, MIN_INDEXABLE_INDUSTRY_ADS, classifyIndustry, type Industry } from "./industries";

export interface GalleryAd {
  adId: string;
  industry: string;
  brandName: string;
  headline: string;
  awareness: string;
  angle: string;
  hook: string;
  src: string;
  width: number;
  height: number;
}

export interface IndustrySummary {
  industry: Industry;
  count: number;
  indexable: boolean;
  hero: GalleryAd;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

async function loadGalleryAdsUncached(): Promise<GalleryAd[]> {
  const features = await prisma.adsFeature.findMany({
    where: { status: { in: [...PUBLIC_FEATURE_STATUSES] } },
    select: { adId: true, brandName: true, status: true, consentAt: true },
    orderBy: [{ consentAt: "desc" }, { id: "asc" }],
  });
  if (!features.length) return [];
  const ads = await prisma.ad.findMany({
    where: { id: { in: features.map((f) => f.adId) }, status: "ready" },
    select: {
      id: true, headline: true, awareness: true, angle: true, hook: true,
      assets: { select: { ratio: true, mime: true, width: true, height: true }, orderBy: { createdAt: "asc" } },
      run: { select: { url: true, extraction: true, brandProfile: { select: { name: true, domain: true, audience: true, mainOffer: true, facts: true, pains: true } } } },
    },
  });
  const byId = new Map(ads.map((a) => [a.id, a]));
  // Featured first, then shortlisted, then newest consent.
  const rank = (st: string) => (st === "featured" ? 0 : st === "shortlisted" ? 1 : 2);
  const ordered = [...features].sort((a, b) => rank(a.status) - rank(b.status));
  return ordered.flatMap((f) => {
    const ad = byId.get(f.adId);
    const asset = ad ? pickFeatureAsset(ad.assets) : undefined;
    if (!ad || !asset) return [];
    const ex = obj(ad.run.extraction);
    const bp = ad.run.brandProfile;
    const industry = classifyIndustry({
      brandName: s(ex.brandName) || bp?.name,
      mainOffer: s(ex.mainOffer) || bp?.mainOffer,
      audience: s(ex.audience) || bp?.audience,
      facts: ex.facts ?? bp?.facts,
      pains: ex.pains ?? bp?.pains,
      url: s(ex.domain) || bp?.domain || ad.run.url,
    });
    if (!industry) return [];
    return [{
      adId: ad.id, industry: industry.slug,
      brandName: s(f.brandName) || s(ex.brandName) || s(bp?.name) || "A Komendly customer",
      headline: ad.headline, awareness: String(ad.awareness), angle: ad.angle, hook: ad.hook,
      src: publicFeatureImageUrl(ad.id), width: asset.width, height: asset.height,
    }];
  });
}

const cachedGalleryAds = unstable_cache(loadGalleryAdsUncached, ["ad-examples-gallery-v1"], { revalidate: 3600, tags: ["ad-examples"] });

/** All consented ads with an industry. Never throws (a DB outage renders an empty gallery). */
export async function loadGalleryAds(): Promise<GalleryAd[]> {
  try {
    return await cachedGalleryAds();
  } catch (err) {
    console.error("[ad-examples] load failed", err);
    return [];
  }
}

/** Industries that have ads, most ads first (ties: list order). */
export function summarizeIndustries(ads: readonly GalleryAd[]): IndustrySummary[] {
  return INDUSTRIES.flatMap((industry) => {
    const mine = ads.filter((a) => a.industry === industry.slug);
    const hero = mine[0];
    return hero ? [{ industry, count: mine.length, indexable: mine.length >= MIN_INDEXABLE_INDUSTRY_ADS, hero }] : [];
  }).sort((a, b) => b.count - a.count);
}

export async function loadIndexableIndustries(): Promise<IndustrySummary[]> {
  return summarizeIndustries(await loadGalleryAds()).filter((x) => x.indexable);
}

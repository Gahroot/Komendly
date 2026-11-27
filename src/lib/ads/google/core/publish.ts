// Publish orchestration (framework-free): one atomic GoogleAdsService.Mutate per campaign kind (temp ids), everything
// PAUSED. If one kind fails after another succeeded, the job removes what it created so a retry can't duplicate.
import type { GoogleAdsClient, MutateOperation } from "./client";
import { resultName } from "./client";
import { toMicros } from "./draft";
import { dedupe, descriptionText, headlineText, keywordText, searchCopyErrors } from "./text";
import { CAMPAIGN_KINDS, LIMITS, idOf, normalizeCustomerId, type CampaignKind, type GeoPick, type KeywordPick, type SearchCopy } from "./types";

export interface GooglePublishPayload {
  adIds: string[];
  customerId: string;
  campaigns: CampaignKind[];
  dailyBudget: number; // major units, per campaign
  geo: GeoPick[];
  keywords: KeywordPick[];
  search: SearchCopy;
  finalUrl: string;
  youtubeVideoUrl?: string;
  maxCpc?: number; // optional Maximize clicks cap (major units)
  bidding?: "clicks" | "conversions";
}

const isStr = (v: unknown): v is string => typeof v === "string";

export function youtubeId(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = url.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}

/** Throws on anything the engine must not send (the web route validates first; this is the last line). */
export function parseGooglePublishPayload(raw: Record<string, unknown>): GooglePublishPayload {
  const fail = (m: string): never => { throw new Error(`Invalid publish_google payload: ${m}`); };
  const adIds = Array.isArray(raw.adIds) ? raw.adIds.filter(isStr) : [];
  const customerId = normalizeCustomerId(isStr(raw.customerId) ? raw.customerId : "") ?? fail("customerId");
  const campaigns = Array.isArray(raw.campaigns) ? CAMPAIGN_KINDS.filter((k) => (raw.campaigns as unknown[]).includes(k)) : [];
  if (!campaigns.length) fail("campaigns");
  const dailyBudget = typeof raw.dailyBudget === "number" && raw.dailyBudget > 0 && raw.dailyBudget < 1_000_000 ? raw.dailyBudget : fail("dailyBudget");
  const geo = (Array.isArray(raw.geo) ? raw.geo : []).filter((g): g is GeoPick => {
    const x = g as Record<string, unknown>;
    return (x?.kind === "location" && isStr(x.id) && /^\d+$/.test(x.id))
      || (x?.kind === "radius" && typeof x.lat === "number" && typeof x.lng === "number" && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180 && typeof x.miles === "number" && x.miles > 0 && x.miles <= LIMITS.radiusMilesMax);
  }).slice(0, LIMITS.geoMax);
  if (!geo.length) fail("geo (pick at least one place)");
  const keywords = (Array.isArray(raw.keywords) ? raw.keywords : [])
    .map((k) => ({ text: keywordText((k as KeywordPick)?.text), match: (k as KeywordPick)?.match === "EXACT" ? "EXACT" as const : "PHRASE" as const }))
    .filter((k) => k.text).slice(0, LIMITS.keywordsMax);
  const s = (raw.search ?? {}) as Partial<SearchCopy>;
  const search: SearchCopy = {
    headlines: (Array.isArray(s.headlines) ? s.headlines.filter(isStr) : []).map((h) => h.trim()).filter(Boolean),
    descriptions: (Array.isArray(s.descriptions) ? s.descriptions.filter(isStr) : []).map((d) => d.trim()).filter(Boolean),
    path1: isStr(s.path1) ? s.path1.trim() : "", path2: isStr(s.path2) ? s.path2.trim() : "",
  };
  if (campaigns.includes("search")) {
    const errs = searchCopyErrors(search);
    if (errs.length) fail(errs.join(" "));
    if (!keywords.length) fail("keywords");
  }
  const finalUrl = isStr(raw.finalUrl) && /^https?:\/\/[^\s]+$/i.test(raw.finalUrl) ? raw.finalUrl : fail("finalUrl");
  const youtubeVideoUrl = isStr(raw.youtubeVideoUrl) && raw.youtubeVideoUrl.trim() ? raw.youtubeVideoUrl.trim() : undefined;
  if (youtubeVideoUrl && !youtubeId(youtubeVideoUrl)) fail("youtubeVideoUrl");
  const maxCpc = typeof raw.maxCpc === "number" && raw.maxCpc > 0 ? raw.maxCpc : undefined;
  const bidding = raw.bidding === "conversions" ? "conversions" : "clicks";
  return { adIds, customerId, campaigns, dailyBudget, geo, keywords, search, finalUrl, youtubeVideoUrl, maxCpc, bidding };
}

export interface PublishImage { adId: string; ratio: string; bytes: Uint8Array; mime: string }
export interface PublishAdInput { id: string; eligible: boolean; headline: string; body: string | null; cta: string | null; ratios: string[] }

export interface GooglePublishStore {
  loadAds(adIds: string[]): Promise<PublishAdInput[]>;
  /** Still image of an ad in one ratio (PNG/JPEG); null when missing or a video. */
  image(adId: string, ratio: string): Promise<PublishImage | null>;
  /** Square (1:1, >=128px) logo PNG/JPEG, or null. */
  logo(): Promise<Uint8Array | null>;
  /** Called right after each kind is created (so a crash still leaves a record) and on failure/rollback. */
  setResult(kind: CampaignKind, r: KindResult): Promise<void>;
}

export interface KindResult {
  status: "published" | "failed";
  campaignResource?: string | null;
  budgetResource?: string | null;
  adGroupResource?: string | null;
  adResources?: string[];
  campaignName?: string;
  error?: string | null;
}

export interface PublishContext {
  client: GoogleAdsClient;
  store: GooglePublishStore;
  payload: GooglePublishPayload;
  businessName: string;
  currency: string;
  now: () => Date;
  signal?: AbortSignal;
}

const EU = { containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING" };

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function campaignName(kind: CampaignKind, business: string, now: Date): string {
  return `Komendly ${kind === "search" ? "Search" : "Demand Gen"} - ${business.slice(0, 60)} - ${now.toISOString().slice(0, 16).replace("T", " ")}`;
}

function bidding(p: GooglePublishPayload): Record<string, unknown> {
  if (p.bidding === "conversions") return { maximizeConversions: {} };
  return { targetSpend: p.maxCpc ? { cpcBidCeilingMicros: String(toMicros(p.maxCpc)) } : {} };
}

function budgetOp(cid: string, name: string, p: GooglePublishPayload): MutateOperation {
  return { campaignBudgetOperation: { create: { resourceName: `customers/${cid}/campaignBudgets/-1`, name: `${name} budget`, amountMicros: String(toMicros(p.dailyBudget)), deliveryMethod: "STANDARD", explicitlyShared: false } } };
}

export function searchOperations(cid: string, name: string, p: GooglePublishPayload): MutateOperation[] {
  const budget = `customers/${cid}/campaignBudgets/-1`;
  const campaign = `customers/${cid}/campaigns/-2`;
  const adGroup = `customers/${cid}/adGroups/-3`;
  const ops: MutateOperation[] = [
    budgetOp(cid, name, p),
    { campaignOperation: { create: {
      resourceName: campaign, name, status: "PAUSED", advertisingChannelType: "SEARCH", campaignBudget: budget, ...bidding(p),
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
      geoTargetTypeSetting: { positiveGeoTargetType: "PRESENCE" }, ...EU,
    } } },
  ];
  for (const g of p.geo) {
    ops.push({ campaignCriterionOperation: { create: g.kind === "location"
      ? { campaign, location: { geoTargetConstant: `geoTargetConstants/${g.id}` } }
      : { campaign, proximity: { geoPoint: { latitudeInMicroDegrees: Math.round(g.lat * 1e6), longitudeInMicroDegrees: Math.round(g.lng * 1e6) }, radius: g.miles, radiusUnits: "MILES" } } } });
  }
  ops.push({ adGroupOperation: { create: { resourceName: adGroup, name: `${name} ad group`, campaign, status: "PAUSED", type: "SEARCH_STANDARD" } } });
  for (const k of p.keywords) ops.push({ adGroupCriterionOperation: { create: { adGroup, status: "ENABLED", keyword: { text: k.text, matchType: k.match } } } });
  ops.push({ adGroupAdOperation: { create: { adGroup, status: "PAUSED", ad: {
    finalUrls: [p.finalUrl],
    responsiveSearchAd: {
      headlines: p.search.headlines.slice(0, LIMITS.headlinesMax).map((text) => ({ text })),
      descriptions: p.search.descriptions.slice(0, LIMITS.descriptionsMax).map((text) => ({ text })),
      ...(p.search.path1 ? { path1: p.search.path1 } : {}), ...(p.search.path1 && p.search.path2 ? { path2: p.search.path2 } : {}),
    },
  } } } });
  return ops;
}

const IMAGE_FIELD: Record<string, string> = { "1:1": "squareMarketingImages", "4:5": "portraitMarketingImages", "9:16": "tallPortraitMarketingImages", "1.91:1": "marketingImages" };

export interface DemandGenInputs {
  images: PublishImage[];
  logo: Uint8Array;
  headlines: string[];
  descriptions: string[];
  longHeadline: string;
  businessName: string;
  youtubeVideoId: string | null;
}

export function demandGenOperations(cid: string, name: string, p: GooglePublishPayload, d: DemandGenInputs): MutateOperation[] {
  const budget = `customers/${cid}/campaignBudgets/-1`;
  const campaign = `customers/${cid}/campaigns/-2`;
  const adGroup = `customers/${cid}/adGroups/-3`;
  const ops: MutateOperation[] = [
    budgetOp(cid, name, p),
    { campaignOperation: { create: { resourceName: campaign, name, status: "PAUSED", advertisingChannelType: "DEMAND_GEN", campaignBudget: budget, ...bidding(p), ...EU } } },
    { adGroupOperation: { create: { resourceName: adGroup, name: `${name} ad group`, campaign, status: "PAUSED" } } },
  ];
  // Upgraded targeting (default for new Demand Gen campaigns): locations live on the ad group.
  for (const g of p.geo) if (g.kind === "location") ops.push({ adGroupCriterionOperation: { create: { adGroup, location: { geoTargetConstant: `geoTargetConstants/${g.id}` } } } });
  let temp = -10;
  const logo = `customers/${cid}/assets/${temp--}`;
  ops.push({ assetOperation: { create: { resourceName: logo, name: `${name} logo`, type: "IMAGE", imageAsset: { data: b64(d.logo) } } } });
  const fields: Record<string, Array<{ asset: string }>> = {};
  for (const img of d.images.slice(0, LIMITS.demandGenImagesMax)) {
    const field = IMAGE_FIELD[img.ratio];
    if (!field) continue;
    const rn = `customers/${cid}/assets/${temp--}`;
    ops.push({ assetOperation: { create: { resourceName: rn, name: `${name} ${img.adId} ${img.ratio}`, type: "IMAGE", imageAsset: { data: b64(img.bytes) } } } });
    (fields[field] ??= []).push({ asset: rn });
  }
  const headlines = d.headlines.slice(0, LIMITS.demandGenHeadlinesMax).map((text) => ({ text }));
  const descriptions = d.descriptions.slice(0, LIMITS.demandGenDescriptionsMax).map((text) => ({ text }));
  ops.push({ adGroupAdOperation: { create: { adGroup, status: "PAUSED", ad: {
    name: `${name} images`, finalUrls: [p.finalUrl],
    demandGenMultiAssetAd: { businessName: d.businessName, headlines, descriptions, logoImages: [{ asset: logo }], ...fields },
  } } } });
  if (d.youtubeVideoId) {
    const video = `customers/${cid}/assets/${temp--}`;
    ops.push({ assetOperation: { create: { resourceName: video, name: `${name} video`, type: "YOUTUBE_VIDEO", youtubeVideoAsset: { youtubeVideoId: d.youtubeVideoId } } } });
    ops.push({ adGroupAdOperation: { create: { adGroup, status: "PAUSED", ad: {
      name: `${name} video`, finalUrls: [p.finalUrl],
      demandGenVideoResponsiveAd: { businessName: { text: d.businessName }, headlines, longHeadlines: [{ text: d.longHeadline }], descriptions, logoImages: [{ asset: logo }], videos: [{ asset: video }] },
    } } } });
  }
  return ops;
}

/** Demand Gen minimum daily budget for a currency (major units), or null when Google doesn't say. */
export async function demandGenMinimum(client: GoogleAdsClient, cid: string, currency: string, signal?: AbortSignal): Promise<number | null> {
  try {
    const rows = await client.search<{ currencyConstant?: { demandGenInfo?: { minimumBudgetPerDayMicros?: string } } }>(cid,
      `SELECT currency_constant.code, currency_constant.demand_gen_info.minimum_budget_per_day_micros FROM currency_constant WHERE currency_constant.code = '${currency.replace(/[^A-Z]/g, "")}'`, signal);
    const m = Number(rows[0]?.currencyConstant?.demandGenInfo?.minimumBudgetPerDayMicros);
    return m > 0 ? m / 1e6 : null;
  } catch {
    return null;
  }
}

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}

export interface Created { kind: CampaignKind; campaign: string; budget: string | null; adGroup: string | null; ads: string[]; name: string }

async function buildDemandGen(c: PublishContext, ads: PublishAdInput[]): Promise<DemandGenInputs> {
  const { payload: p, store } = c;
  if (!p.geo.some((g) => g.kind === "location")) throw new Error("Demand Gen ads need a city, region or country, not only a radius.");
  const min = await demandGenMinimum(c.client, p.customerId, c.currency, c.signal);
  if (min && p.dailyBudget < min) throw new Error(`Demand Gen needs a daily budget of at least ${min} ${c.currency}.`);
  const logo = await store.logo();
  if (!logo) throw new Error("Demand Gen ads need your logo. Add a logo to your brand and try again.");
  const images: PublishImage[] = [];
  for (const ad of ads) for (const ratio of ["1:1", "4:5", "9:16", "1.91:1"]) {
    if (!ad.ratios.includes(ratio)) continue;
    const img = await store.image(ad.id, ratio);
    if (img) images.push(img);
  }
  if (!images.some((i) => i.ratio === "1:1" || i.ratio === "1.91:1")) throw new Error("Demand Gen ads need at least one square (1:1) image. Pick ads made in 1:1.");
  const headlines = dedupe([...p.search.headlines, ...ads.map((a) => headlineText(a.headline))].map((h) => headlineText(h)).filter(Boolean)).slice(0, LIMITS.demandGenHeadlinesMax);
  const descriptions = dedupe([...p.search.descriptions, ...ads.map((a) => descriptionText(a.body))].map((d) => descriptionText(d)).filter((d) => d.length >= 5)).slice(0, LIMITS.demandGenDescriptionsMax);
  if (!headlines.length || !descriptions.length) throw new Error("Demand Gen ads need at least one headline and one description.");
  const businessName = headlineText(c.businessName, LIMITS.businessName) || headlineText(new URL(p.finalUrl).hostname.replace(/^www\./, ""), LIMITS.businessName);
  const longHeadline = descriptionText(ads[0]?.headline ?? headlines[0], LIMITS.demandGenLongHeadline).replace(/[.]$/, "");
  return { images, logo, headlines, descriptions, longHeadline, businessName, youtubeVideoId: youtubeId(p.youtubeVideoUrl) };
}

function createdFrom(kind: CampaignKind, name: string, ops: MutateOperation[], results: Awaited<ReturnType<GoogleAdsClient["mutate"]>>): Created {
  const pick = (key: string) => ops.map((o, i) => (key in o ? resultName(results[i]) : null)).filter((x): x is string => !!x);
  return { kind, name, budget: pick("campaignBudgetOperation")[0] ?? null, campaign: pick("campaignOperation")[0] ?? "", adGroup: pick("adGroupOperation")[0] ?? null, ads: pick("adGroupAdOperation") };
}

/** Remove what this job created (campaign removal cascades to its ad groups/ads; budgets are removed separately). */
export async function rollback(client: GoogleAdsClient, cid: string, created: Created[], signal?: AbortSignal): Promise<boolean> {
  if (!created.length) return true;
  try {
    const ops: MutateOperation[] = created.filter((c) => c.campaign).map((c) => ({ campaignOperation: { remove: c.campaign } }));
    if (ops.length) await client.mutate(cid, ops, { signal });
    const budgets = created.map((c) => c.budget).filter((b): b is string => !!b).map((b) => ({ campaignBudgetOperation: { remove: b } }));
    if (budgets.length) await client.mutate(cid, budgets, { signal }).catch(() => undefined); // removed budgets of removed campaigns are harmless
    return true;
  } catch {
    return false;
  }
}

export interface PublishSummary { created: Array<{ kind: CampaignKind; campaignId: string | null }>; failed: CampaignKind[]; rolledBack: boolean }

export async function publishToGoogle(c: PublishContext): Promise<PublishSummary> {
  const { payload: p, store, client } = c;
  const all = await store.loadAds(p.adIds);
  const ads = all.filter((a) => a.eligible);
  const created: Created[] = [];
  let failure: { kind: CampaignKind; error: string } | null = null;
  if (!ads.length || ads.length !== p.adIds.length) failure = { kind: p.campaigns[0]!, error: "Only finished ads that passed quality checks can be published." };
  for (const kind of failure ? [] : p.campaigns) {
    const name = campaignName(kind, c.businessName, c.now());
    try {
      const ops = kind === "search" ? searchOperations(p.customerId, name, p) : demandGenOperations(p.customerId, name, p, await buildDemandGen(c, ads));
      const results = await client.mutate(p.customerId, ops, { signal: c.signal });
      const made = createdFrom(kind, name, ops, results);
      created.push(made);
      await store.setResult(kind, { status: "published", campaignResource: made.campaign, budgetResource: made.budget, adGroupResource: made.adGroup, adResources: made.ads, campaignName: name, error: null });
    } catch (e) {
      failure = { kind, error: errText(e) };
      break;
    }
  }
  if (!failure) return { created: created.map((x) => ({ kind: x.kind, campaignId: idOf(x.campaign) })), failed: [], rolledBack: false };

  const rolledBack = await rollback(client, p.customerId, created, c.signal);
  for (const made of created) {
    await store.setResult(made.kind, rolledBack
      ? { status: "failed", campaignResource: null, budgetResource: null, adGroupResource: null, adResources: [], campaignName: made.name, error: `Not kept because the ${failure.kind === "search" ? "Search" : "Demand Gen"} campaign failed, so nothing is left half-made. Fix the problem and publish again.` }
      : { status: "published", campaignResource: made.campaign, budgetResource: made.budget, adGroupResource: made.adGroup, adResources: made.ads, campaignName: made.name, error: `The other campaign failed and we couldn't remove this one. It is paused; remove it in Google Ads before publishing again.` });
  }
  for (const kind of p.campaigns) if (!created.some((x) => x.kind === kind)) await store.setResult(kind, { status: "failed", error: kind === failure.kind ? failure.error : "Not created because another campaign in this publish failed." });
  return { created: rolledBack ? [] : created.map((x) => ({ kind: x.kind, campaignId: idOf(x.campaign) })), failed: p.campaigns.filter((k) => rolledBack || !created.some((x) => x.kind === k)), rolledBack };
}

/** Start (campaign + ad group + ads ENABLED) or pause (campaign PAUSED). */
export function activationOperations(t: { campaignResource: string; adGroupResource?: string | null; adResources?: string[] }, action: "enable" | "pause"): MutateOperation[] {
  if (action === "pause") return [{ campaignOperation: { update: { resourceName: t.campaignResource, status: "PAUSED" }, updateMask: "status" } }];
  return [
    ...(t.adResources ?? []).map((rn) => ({ adGroupAdOperation: { update: { resourceName: rn, status: "ENABLED" }, updateMask: "status" } })),
    ...(t.adGroupResource ? [{ adGroupOperation: { update: { resourceName: t.adGroupResource, status: "ENABLED" }, updateMask: "status" } }] : []),
    { campaignOperation: { update: { resourceName: t.campaignResource, status: "ENABLED" }, updateMask: "status" } },
  ];
}

export async function setCampaignState(client: GoogleAdsClient, customerId: string, t: Parameters<typeof activationOperations>[0], action: "enable" | "pause", signal?: AbortSignal): Promise<void> {
  await client.mutate(customerId, activationOperations(t, action), { signal });
}


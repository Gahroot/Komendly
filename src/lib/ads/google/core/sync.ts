// Sync: serving status, policy approval (plain English) and lifetime metrics for campaigns Komendly created.
import type { GoogleAdsClient } from "./client";
import type { Policy, Serving } from "./types";

export interface CampaignSync { serving: Serving; policy: Policy; policyIssues: string[]; metrics: { impressions: number; clicks: number; cost: number; conversions: number; currency: string; since: string } }

const TOPICS: Record<string, string> = {
  DESTINATION_NOT_WORKING: "Your website link didn't load for Google's reviewers.",
  DESTINATION_MISMATCH: "The web address shown in the ad doesn't match where it leads.",
  DESTINATION_EXPERIENCE: "Google flagged the landing page experience (for example pop-ups or a hard-to-use page).",
  MISLEADING_CONTENT: "Google thinks part of the ad text could mislead people.",
  UNRELIABLE_CLAIMS: "The ad makes a claim Google wants proof for.",
  PUNCTUATION: "Unusual punctuation in the ad text.",
  EXCESSIVE_CAPITALIZATION: "Too many capital letters in the ad text.",
  CAPITALIZATION: "Too many capital letters in the ad text.",
  REPETITION: "The same word or phrase is repeated too much.",
  SYMBOLS: "Symbols or emoji Google doesn't allow in ads.",
  GIMMICKY: "The text looks gimmicky to Google (odd spacing or symbols).",
  TRADEMARKS_IN_AD_TEXT: "The ad uses a trademark Google limits.",
  TRADEMARKS: "The ad uses a trademark Google limits.",
  HEALTHCARE_AND_MEDICINES: "Health or medicine topics: Google limits where these ads show.",
  ALCOHOL: "Alcohol: Google limits where these ads show.",
  GAMBLING: "Gambling: Google limits where these ads show.",
  FINANCIAL_SERVICES: "Financial services: Google may ask for verification.",
  LOCAL_SERVICES_VERIFICATION: "Google asks for business verification for this kind of service.",
  ADVERTISER_VERIFICATION: "Google asks you to complete advertiser verification in Google Ads.",
  IMAGE_QUALITY: "An image is blurry, cropped badly or hard to read.",
  NON_FAMILY_SAFE: "Google limits where this content can show.",
  COPYRIGHTED_CONTENT: "Possible copyrighted material.",
};

export function plainTopic(topic: string): string {
  const t = topic.toUpperCase();
  return TOPICS[t] ?? `Google policy note: ${t.toLowerCase().replace(/_/g, " ")}.`;
}

export function mapServing(status: string | undefined): Serving {
  if (status === "ENABLED") return "enabled";
  if (status === "PAUSED") return "paused";
  if (status === "REMOVED") return "removed";
  return "unknown";
}

/** Combine per-ad policy summaries into one campaign-level state. */
export function aggregatePolicy(ads: Array<{ approval?: string; review?: string }>): Policy {
  if (!ads.length) return "unknown";
  const ap = ads.map((a) => a.approval ?? "");
  const reviewing = ads.some((a) => a.review === "REVIEW_IN_PROGRESS" || a.review === "UNDER_APPEAL" || a.review === "ELIGIBLE_MAY_SERVE") && !ap.some((x) => x === "APPROVED" || x === "APPROVED_LIMITED" || x === "DISAPPROVED");
  if (reviewing) return "under_review";
  const ok = ap.filter((x) => x === "APPROVED").length;
  const limited = ap.filter((x) => x === "APPROVED_LIMITED" || x === "AREA_OF_INTEREST_ONLY").length;
  const bad = ap.filter((x) => x === "DISAPPROVED").length;
  if (bad && !ok && !limited) return "disapproved";
  if (limited || (bad && ok)) return "limited";
  if (ok) return "approved";
  return "under_review";
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function syncCampaigns(client: GoogleAdsClient, customerId: string, campaignResources: string[], currency: string, since: string, signal?: AbortSignal): Promise<Map<string, CampaignSync>> {
  const out = new Map<string, CampaignSync>();
  if (!campaignResources.length) return out;
  const list = campaignResources.map((r) => `'${r.replace(/'/g, "")}'`).join(",");
  const camps = await client.search<{ campaign?: { resourceName?: string; status?: string }; metrics?: { impressions?: string; clicks?: string; costMicros?: string; conversions?: number } }>(customerId,
    `SELECT campaign.resource_name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.resource_name IN (${list})`, signal);
  const ads = await client.search<{ campaign?: { resourceName?: string }; adGroupAd?: { status?: string; policySummary?: { approvalStatus?: string; reviewStatus?: string; policyTopicEntries?: Array<{ topic?: string; type?: string }> } } }>(customerId,
    `SELECT campaign.resource_name, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.policy_topic_entries FROM ad_group_ad WHERE campaign.resource_name IN (${list}) AND ad_group_ad.status != 'REMOVED'`, signal);
  for (const c of camps) {
    const rn = c.campaign?.resourceName;
    if (!rn) continue;
    const mine = ads.filter((a) => a.campaign?.resourceName === rn);
    const issues = [...new Set(mine.flatMap((a) => (a.adGroupAd?.policySummary?.policyTopicEntries ?? [])
      .filter((t) => t.topic && t.type !== "PROHIBITED_NOT_APPLICABLE" && t.type !== "ENTITY_NOT_APPLICABLE")
      .map((t) => plainTopic(t.topic!))))].slice(0, 10);
    out.set(rn, {
      serving: mapServing(c.campaign?.status),
      policy: aggregatePolicy(mine.map((a) => ({ approval: a.adGroupAd?.policySummary?.approvalStatus, review: a.adGroupAd?.policySummary?.reviewStatus }))),
      policyIssues: issues,
      metrics: { impressions: num(c.metrics?.impressions), clicks: num(c.metrics?.clicks), cost: Math.round(num(c.metrics?.costMicros) / 10_000) / 100, conversions: Math.round(num(c.metrics?.conversions) * 100) / 100, currency, since },
    });
  }
  for (const rn of campaignResources) if (!out.has(rn)) out.set(rn, { serving: "removed", policy: "unknown", policyIssues: [], metrics: { impressions: 0, clicks: 0, cost: 0, conversions: 0, currency, since } });
  return out;
}

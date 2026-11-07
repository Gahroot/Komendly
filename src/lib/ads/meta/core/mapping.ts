// Pure mapping from Komendly runs/ads to Meta Marketing API payloads. Framework-free.
// Safety invariant: every object we create is PAUSED. Nothing here can spend money.
import type { AdGoalValue, Ratio } from "../../contracts";

export const META_OBJECTIVES = {
  leads: "OUTCOME_LEADS",
  sales: "OUTCOME_SALES",
  awareness: "OUTCOME_AWARENESS",
  traffic: "OUTCOME_TRAFFIC",
  app_installs: "OUTCOME_APP_PROMOTION",
} as const satisfies Record<Exclude<AdGoalValue, "auto">, string>;
export type MetaObjective = (typeof META_OBJECTIVES)[keyof typeof META_OBJECTIVES];

/** Run goal (resolved goal preferred) -> Meta objective. `auto`/unknown falls back to traffic. */
export function objectiveForGoal(goal: string | null | undefined): MetaObjective {
  if (goal && goal in META_OBJECTIVES) return META_OBJECTIVES[goal as keyof typeof META_OBJECTIVES];
  return META_OBJECTIVES.traffic;
}

const OPTIMIZATION: Record<MetaObjective, string> = {
  OUTCOME_LEADS: "LINK_CLICKS",
  OUTCOME_SALES: "LINK_CLICKS",
  OUTCOME_AWARENESS: "REACH",
  OUTCOME_TRAFFIC: "LINK_CLICKS",
  OUTCOME_APP_PROMOTION: "APP_INSTALLS",
};

export type PlacementGroup = "feed" | "stories_reels";

/** 9:16 -> Stories/Reels; 4:5 and 1:1 -> Feed. */
export function placementGroupForRatio(ratio: Ratio): PlacementGroup {
  return ratio === "9:16" ? "stories_reels" : "feed";
}

export interface PlacementTargeting {
  publisher_platforms: string[];
  facebook_positions: string[];
  instagram_positions: string[];
}

export function placementTargeting(group: PlacementGroup): PlacementTargeting {
  return group === "stories_reels"
    ? { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["story", "facebook_reels"], instagram_positions: ["story", "reels"] }
    : { publisher_platforms: ["facebook", "instagram"], facebook_positions: ["feed"], instagram_positions: ["stream"] };
}

const CTA_TYPES: Array<[RegExp, string]> = [
  [/shop|buy|order/i, "SHOP_NOW"],
  [/sign ?up|join|register/i, "SIGN_UP"],
  [/subscribe/i, "SUBSCRIBE"],
  [/download/i, "DOWNLOAD"],
  [/install/i, "INSTALL_MOBILE_APP"],
  [/contact|call|talk/i, "CONTACT_US"],
  [/offer|deal|discount/i, "GET_OFFER"],
  [/quote/i, "GET_QUOTE"],
  [/book|demo|apply/i, "APPLY_NOW"],
];

/** Free-text CTA from the Ad row -> Meta call_to_action type. */
export function ctaType(cta: string | null | undefined, objective: MetaObjective): string {
  const hit = cta ? CTA_TYPES.find(([re]) => re.test(cta)) : undefined;
  if (hit) return hit[1];
  return objective === "OUTCOME_APP_PROMOTION" ? "INSTALL_MOBILE_APP" : "LEARN_MORE";
}

export const PAUSED = "PAUSED" as const;

export function campaignPayload(input: { name: string; objective: MetaObjective }) {
  return {
    name: input.name,
    objective: input.objective,
    status: PAUSED,
    special_ad_categories: [] as string[],
    is_adset_budget_sharing_enabled: false,
  };
}

export function adSetPayload(input: {
  name: string;
  campaignId: string;
  objective: MetaObjective;
  group: PlacementGroup;
  dailyBudgetMinor: number;
  countries: string[];
}) {
  return {
    name: input.name,
    campaign_id: input.campaignId,
    status: PAUSED,
    daily_budget: Math.max(1, Math.round(input.dailyBudgetMinor)),
    billing_event: "IMPRESSIONS",
    optimization_goal: OPTIMIZATION[input.objective],
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: { geo_locations: { countries: input.countries }, ...placementTargeting(input.group) },
  };
}

export interface CreativeCopy {
  headline: string;
  body: string | null;
  cta: string | null;
  link: string;
}

export function creativePayload(input: {
  name: string;
  pageId: string;
  objective: MetaObjective;
  copy: CreativeCopy;
  media: { kind: "image"; imageHash: string } | { kind: "video"; videoId: string; thumbnailUrl: string };
}) {
  const call_to_action = { type: ctaType(input.copy.cta, input.objective), value: { link: input.copy.link } };
  const message = input.copy.body ?? input.copy.headline;
  const object_story_spec =
    input.media.kind === "image"
      ? { page_id: input.pageId, link_data: { image_hash: input.media.imageHash, link: input.copy.link, message, name: input.copy.headline, call_to_action } }
      : { page_id: input.pageId, video_data: { video_id: input.media.videoId, image_url: input.media.thumbnailUrl, title: input.copy.headline, message, call_to_action } };
  return { name: input.name, object_story_spec };
}

export function adPayload(input: { name: string; adSetId: string; creativeId: string }) {
  return { name: input.name, adset_id: input.adSetId, creative: { creative_id: input.creativeId }, status: PAUSED };
}

export function actId(adAccountId: string): string {
  return adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
}

/** Link to review the paused campaign in Ads Manager. */
export function adsManagerUrl(adAccountId: string, campaignId?: string): string {
  const u = new URL("https://adsmanager.facebook.com/adsmanager/manage/campaigns");
  u.searchParams.set("act", adAccountId.replace(/^act_/, ""));
  if (campaignId) u.searchParams.set("selected_campaign_ids", campaignId);
  return u.toString();
}

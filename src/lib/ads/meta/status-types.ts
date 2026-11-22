// Response shape of GET /api/ads/meta/status (client-safe).
import type { Readiness } from "./readiness";

export interface MetaAdAccountView {
  id: string;
  name: string;
  currency?: string;
  status?: number;
  disableReason?: number;
  hasPayment?: boolean;
  readiness: Readiness;
}
export interface MetaPublishRowView {
  id: string;
  ratio: string | null;
  status: string;
  metaAdId: string | null;
  campaignId: string | null;
  error: string | null;
  adsManagerUrl: string | null;
}
export interface MetaAdView {
  id: string;
  kind: string;
  index: number;
  headline: string;
  eligible: boolean;
  ratios: string[];
  /** Preview image URL for the picker, null when the ad has no image yet. */
  thumb: string | null;
  thumbIsVideo: boolean;
  publishes: MetaPublishRowView[];
}
export interface MetaCampaignView {
  campaignId: string;
  adAccountId: string | null;
  adSets: number;
  /** Published ad rows (ad x size) in this campaign. */
  ads: number;
  /** Daily budget per ad set, in the account's minor units. */
  dailyBudgetMinor: number;
  activation: "none" | "activating" | "active" | "failed";
  activationError: string | null;
  adsManagerUrl: string | null;
}
export type MetaStatus =
  | { access: "upgrade" }
  | {
      access: "ok";
      mode: "mcp" | "graph";
      connected: boolean;
      selection: { adAccountId: string | null; pageId: string | null } | null;
      accounts:
        | { adAccounts: MetaAdAccountView[]; pages: Array<{ id: string; name: string }>; /** Issues when no ad account is picked (no_ad_account, no_page). */ readiness: Readiness }
        | { error: string }
        | null;
      ratios: string[];
      /** Run goal (resolved preferred), used to prefill the campaign goal. */
      goal: string;
      /** "Turn on now" is available (meta_activate flag). */
      canActivate: boolean;
      campaigns: MetaCampaignView[];
      ads: MetaAdView[];
    };

/** 9:16 runs in Stories/Reels, 4:5 and 1:1 in Feed (mirrors core/mapping). */
export function placementLabel(ratio: string): string {
  return ratio === "9:16" ? "Stories & Reels" : "Feed";
}

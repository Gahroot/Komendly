// Response shape of GET /api/ads/meta/status (client-safe).
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
  publishes: MetaPublishRowView[];
}
export type MetaStatus =
  | { access: "upgrade" }
  | {
      access: "ok";
      mode: "mcp" | "graph";
      connected: boolean;
      selection: { adAccountId: string | null; pageId: string | null } | null;
      accounts: { adAccounts: Array<{ id: string; name: string; currency?: string }>; pages: Array<{ id: string; name: string }> } | { error: string } | null;
      ratios: string[];
      ads: MetaAdView[];
    };

/** 9:16 runs in Stories/Reels, 4:5 and 1:1 in Feed (mirrors core/mapping). */
export function placementLabel(ratio: string): string {
  return ratio === "9:16" ? "Stories & Reels" : "Feed";
}

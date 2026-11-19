// Integration landing pages (/integrations/*). Pure data: directory status lives here so flipping
// `listed` to true (and setting `directoryUrl`) switches the copy from custom-connector steps to a store install link.

export const MCP_URL = "https://www.komendly.com/api/mcp";

export type IntegrationSlug = "chatgpt" | "claude" | "shopify";

export interface IntegrationStatus {
  /** Live in the platform's public directory / app store. */
  listed: boolean;
  /** Install link once listed. */
  directoryUrl: string | null;
  directoryName: string;
}

export const INTEGRATION_STATUS: Record<IntegrationSlug, IntegrationStatus> = {
  chatgpt: { listed: false, directoryUrl: null, directoryName: "ChatGPT app directory" },
  claude: { listed: false, directoryUrl: null, directoryName: "Claude connector directory" },
  shopify: { listed: false, directoryUrl: null, directoryName: "Shopify App Store" },
};

/** One line describing the directory status, used by pages and llms.txt. */
export function statusLine(slug: IntegrationSlug): string {
  const s = INTEGRATION_STATUS[slug];
  if (s.listed && s.directoryUrl) return `Install it from the ${s.directoryName}.`;
  if (slug === "shopify") return `The Komendly: Ad Creatives app is in review for the ${s.directoryName}; until then, paste your store URL into the free ad pack.`;
  return `Submitted to the ${s.directoryName} and waiting for review; it works today as a custom connector.`;
}

export interface IntegrationCard {
  slug: IntegrationSlug;
  name: string;
  title: string;
  description: string;
}

export const INTEGRATIONS: IntegrationCard[] = [
  {
    slug: "chatgpt",
    name: "ChatGPT",
    title: "Make Facebook & Instagram ads and videos in ChatGPT",
    description: "Ask ChatGPT for Facebook and Instagram ads or a video ad. Komendly reads your website, makes the ad pack and hands back the images, copy and download links in the chat.",
  },
  {
    slug: "claude",
    name: "Claude",
    title: "Komendly connector for Claude",
    description: "Add Komendly's MCP server to claude.ai, Claude Desktop or Claude Code, sign in once, and let Claude make ad packs, Ozzy Studio videos and launch videos for you.",
  },
  {
    slug: "shopify",
    name: "Shopify",
    title: "AI ad creatives for your Shopify store",
    description: "Turn your Shopify store and products into ready-to-run Facebook and Instagram ad creatives. Paste your store URL for a free ad pack today; the Shopify app is in review.",
  },
];

export const INTEGRATION_PATHS = ["/integrations", ...INTEGRATIONS.map((i) => `/integrations/${i.slug}`)];

/** Tools the hosted MCP server registers (src/lib/agent-keys/mcp-server.ts), in plain words. */
export const MCP_TOOLS: { name: string; line: string }[] = [
  { name: "ads_create_pack", line: "Make an Ad Pack from a website URL: static ads (image, headline, ad copy in the brand's style), plus an animated ad on paid plans." },
  { name: "ads_get_run / ads_list_runs", line: "Check an Ad Pack's progress and get its ads with fresh image and video links; list recent packs." },
  { name: "studio_create_video / studio_send_message", line: "Start an Ozzy Studio video (promo, ad, animation, explainer, edit of your footage) and ask for edits like \"make it 9:16\"." },
  { name: "studio_remix", line: "Show Ozzy an ad (TikTok, Instagram, Facebook Ad Library or X link) and he rebuilds its structure and style for your brand, without copying its footage, logos or words." },
  { name: "studio_launch_video", line: "Ozzy opens your live product, records it and cuts a 20-40 second launch video with captions." },
  { name: "studio_get_session / studio_list_sessions", line: "Status, Ozzy's latest reply and every video version of a Studio chat; list recent chats." },
  { name: "studio_ad_copy", line: "Suggested Meta ad copy for a video: headline, primary text, call-to-action button and landing URL." },
  { name: "campaign_kit", line: "Every ready creative from a pack or video as a hand-off list (media URL, size, placement, headline, text, button) for your Meta Ads tool." },
  { name: "upload_media", line: "Add your own video, image or audio for Ozzy to use." },
  { name: "get_download_url", line: "A fresh 7-day download link for an ad image or a video." },
  { name: "autopilot_get / autopilot_set", line: "See or change Ozzy Autopilot: on/off, this week's focus and the next weekly drop." },
  { name: "get_account", line: "Your plan, credits left, free Studio videos left and whether the free Ad Pack was used." },
];

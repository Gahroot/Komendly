// Ads trial -> Ozzy Studio bridge (goal ezmotionkom). Pure, client-safe: offer arbitration, prompts, starters.
// Rules: Studio shows only after the run's ads are ready, below the gallery + upsell; one offer at a time
// (while the Launch Quarter window is open the Studio launch offer is replaced by Launch Quarter "includes Ozzy Studio").

export const STUDIO_BRIDGE_FLAG = "studio_bridge";

export const BRIDGE_PLACEMENTS = ["ad_card", "ad_lightbox", "motion_card", "run_card", "app_home"] as const;
export type BridgePlacement = (typeof BRIDGE_PLACEMENTS)[number];

export const BRIDGE_STARTERS = ["reels", "logo", "promo", "motion_edit"] as const;
export type BridgeStarter = (typeof BRIDGE_STARTERS)[number];

export type StudioOfferChoice = "launch_quarter" | "studio_launch" | "none";

/**
 * One offer at a time (server truth). Paid workspaces get no offer. An open Launch Quarter window wins over the
 * Studio launch offer (Studio is part of every paid plan); after it closes the Studio launch offer shows as usual.
 */
export function arbitrateStudioOffer(i: { paid: boolean; suspended?: boolean; launchQuarterOpen: boolean; studioLaunchOpen: boolean }): StudioOfferChoice {
  if (i.paid || i.suspended) return "none";
  if (i.launchQuarterOpen) return "launch_quarter";
  return i.studioLaunchOpen ? "studio_launch" : "none";
}

/** The bridge renders only with the flag on and the run's ads ready (never during generation). */
export function bridgeVisible(i: { flag: boolean; runStatus: string; readyAds: number }): boolean {
  return i.flag && (i.runStatus === "completed" || i.runStatus === "partial") && i.readyAds > 0;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** First message sent to Ozzy for each bridge starter. */
export function bridgePrompt(i: { starter: BridgeStarter; headline?: string | null; url: string; hasLogo?: boolean }): string {
  const site = `My website: ${i.url}`;
  const headline = (i.headline ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  switch (i.starter) {
    case "reels":
      return `Turn this ad into a 10-second vertical video for Reels${headline ? `: "${headline}"` : ""}. Keep my brand. ${site}`;
    case "motion_edit":
      return `Here's my animated ad${headline ? ` ("${headline}")` : ""}. Make it punchier: faster cuts, bold captions, same brand. ${site}`;
    case "logo":
      return `Animate my logo into a 5-second intro.${i.hasLogo ? " Logo attached." : ""} Keep my brand colours. ${site}`;
    case "promo":
      return `Make a 15-second promo video for ${domainOf(i.url)}. Keep my brand. ${site}`;
  }
}

export function bridgeTitle(starter: BridgeStarter, domain: string): string {
  const t = { reels: "Ad → Reels video", motion_edit: "Edit my animated ad", logo: "Animate my logo", promo: `15s promo for ${domain}` }[starter];
  return t.slice(0, 60);
}

export interface BridgeAdLike {
  id: string;
  index: number;
  kind: string;
  status: string;
  bonusKind?: string;
  locked?: boolean;
}

/** "Best" ad for the Reels starter: the first ready, unlocked, non-bonus static ad (plan order = strongest angle first). */
export function pickBridgeAd<T extends BridgeAdLike>(ads: readonly T[]): T | null {
  const ok = ads.filter((a) => a.status === "ready" && !a.locked && !a.bonusKind).slice().sort((a, b) => a.index - b.index);
  return ok.find((a) => a.kind === "static") ?? ok[0] ?? null;
}

/** Which asset to copy into Studio: motion -> the mp4; static -> 9:16, then 4:5, then any image. */
export function pickBridgeAsset<T extends { ratio: string; mime: string }>(kind: string, assets: readonly T[]): T | null {
  if (kind === "motion") return assets.find((a) => a.mime === "video/mp4") ?? null;
  const imgs = assets.filter((a) => a.mime.startsWith("image/"));
  return imgs.find((a) => a.ratio === "9:16") ?? imgs.find((a) => a.ratio === "4:5") ?? imgs[0] ?? null;
}

export const LQ_STUDIO_LINE = "Ozzy Studio included: chat with Ozzy to make videos and edit your own footage";

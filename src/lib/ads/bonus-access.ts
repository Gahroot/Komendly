// Locked trial bonus ads (contract shared with the engine): an Ad whose visualBrief has `locked: true` and
// `bonusKind: "story" | "motion"` is a bonus. Until the workspace has paid, only its AdAsset with ratio
// "preview" (blurred low-res poster) may be served. Locked state is derived at read time from paid status,
// never stored, so paying unlocks every bonus ad at once. Pure: safe for client and server.

/** fresh = the monthly "Ozzy made you a new ad" (AdRun kind "nurture"), a locked static. */
export type BonusKind = "story" | "motion" | "fresh";

export const PREVIEW_RATIO = "preview";

export interface BonusInfo {
  bonusKind: BonusKind;
}

/** Bonus metadata from an Ad's visualBrief JSON; null for normal ads. */
export function parseBonus(visualBrief: unknown): BonusInfo | null {
  if (!visualBrief || typeof visualBrief !== "object") return null;
  const brief = visualBrief as { locked?: unknown; bonusKind?: unknown };
  if (brief.locked !== true) return null;
  return { bonusKind: brief.bonusKind === "story" || brief.bonusKind === "fresh" ? brief.bonusKind : "motion" };
}

/** Workspace may see full-res bonus ads: an active paid plan (incl. Launch Quarter) or any purchased credit pack. */
export function hasBonusAccess(input: { isPaid: boolean; hasPurchasedCredits: boolean; suspended?: boolean }): boolean {
  if (input.suspended) return false;
  return input.isPaid || input.hasPurchasedCredits;
}

export function isAdLocked(visualBrief: unknown, unlocked: boolean): boolean {
  return !unlocked && parseBonus(visualBrief) !== null;
}

export type AssetUse = "preview" | "download";

/**
 * Server-side gate for one asset. Normal ads: everything except the internal "preview" poster is served as before
 * (a stray preview row is still harmless to view). Locked bonus ads: only the preview poster may be viewed, never downloaded.
 */
export function canServeAsset(args: { visualBrief: unknown; assetRatio: string; unlocked: boolean; use: AssetUse }): boolean {
  if (!isAdLocked(args.visualBrief, args.unlocked)) return true;
  return args.use === "preview" && args.assetRatio === PREVIEW_RATIO;
}

/** Assets that belong in an export (ZIP / publish): never preview posters, never locked bonus ads. */
export function exportableAssets<A extends { ratio: string }>(ad: { visualBrief: unknown; assets: A[] }, unlocked: boolean): A[] {
  if (isAdLocked(ad.visualBrief, unlocked)) return [];
  return ad.assets.filter((a) => a.ratio !== PREVIEW_RATIO);
}

export interface BonusSummary {
  stories: number;
  videos: number;
  /** Monthly fresh ads (nurture runs); optional so older call sites keep working. */
  fresh?: number;
  locked: boolean;
}

/** Counts of ready bonus ads; null when the run has none (UI then looks exactly as without bonuses). */
export function summarizeBonus(ads: { visualBrief: unknown; status: string }[], unlocked: boolean): BonusSummary | null {
  let stories = 0;
  let videos = 0;
  let fresh = 0;
  for (const ad of ads) {
    const bonus = parseBonus(ad.visualBrief);
    if (!bonus || ad.status !== "ready") continue;
    if (bonus.bonusKind === "story") stories += 1;
    else if (bonus.bonusKind === "fresh") fresh += 1;
    else videos += 1;
  }
  if (stories + videos + fresh === 0) return null;
  return fresh ? { stories, videos, fresh, locked: !unlocked } : { stories, videos, locked: !unlocked };
}

/** "3 Stories versions + 2 more videos" */
export function bonusLabel(s: { stories: number; videos: number; fresh?: number }): string {
  const parts: string[] = [];
  if (s.fresh) parts.push(`${s.fresh} new ${s.fresh === 1 ? "ad" : "ads"}`);
  if (s.stories > 0) parts.push(`${s.stories} Stories ${s.stories === 1 ? "version" : "versions"}`);
  if (s.videos > 0) parts.push(`${s.videos} more ${s.videos === 1 ? "video" : "videos"}`);
  return parts.join(" + ");
}

/** Keep polling a settled trial run while bonus ads are still expected (rendering rows, or none yet shortly after completion). */
export function shouldAwaitBonus(args: {
  enabled: boolean;
  isTrial: boolean;
  completedAt: Date | null;
  bonusReadyLogged: boolean;
  pendingBonusAds: number;
  now: Date;
  windowMinutes?: number;
}): boolean {
  if (!args.enabled || !args.isTrial) return false;
  if (args.pendingBonusAds > 0) return true;
  if (args.bonusReadyLogged || !args.completedAt) return false;
  return args.now.getTime() - args.completedAt.getTime() < (args.windowMinutes ?? 20) * 60_000;
}

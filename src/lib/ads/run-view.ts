import type { Ad, AdAsset, AdRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CorrectionsSchema, MAX_EXTRACT_RETRIES, type Ratio } from "./contracts";
import { trackAdsEvent } from "./events";
import { extractRetriesUsed, parseExtraction } from "./run-confirm";
import type { AdView, RunView } from "./run-types";
import { freeTrialAdsFor, isReplacedAd, parseBonus, PREVIEW_RATIO, shouldAwaitBonus, summarizeBonus, trialLockedAdIds } from "./bonus-access";
import { isBonusUnlockedById, isReferredWorkspace, trialBonusEnabled } from "./bonus-unlock";
import { studioBridgeEnabled } from "@/lib/studio/bridge-server";

function assetUrls(id: string) {
  return { previewUrl: `/api/ads/assets/${id}/preview`, downloadUrl: `/api/ads/assets/${id}/download` };
}

function adView(ad: Ad & { assets: AdAsset[] }, unlocked: boolean, packLocked = false): AdView {
  const bonus = parseBonus(ad.visualBrief);
  const locked = (Boolean(bonus) && !unlocked) || packLocked;
  const preview = ad.assets.find((a) => a.ratio === PREVIEW_RATIO);
  // Main ads past the free limit: a blurred thumbnail of their 4:5 (or first) still image, served by the preview route.
  const still = packLocked && !bonus ? (ad.assets.find((a) => a.ratio === "4:5" && a.mime.startsWith("image/")) ?? ad.assets.find((a) => a.ratio !== PREVIEW_RATIO && a.mime.startsWith("image/"))) : undefined;
  return {
    id: ad.id,
    index: ad.index,
    kind: ad.kind,
    awareness: ad.awareness,
    angle: ad.angle,
    headline: ad.headline,
    body: ad.body,
    cta: ad.cta,
    status: ad.status,
    ...(bonus ? { bonusKind: bonus.bonusKind, locked, lockedPreviewUrl: locked && preview ? assetUrls(preview.id).previewUrl : null } : {}),
    ...(packLocked && !bonus ? { locked: true, lockedPreviewUrl: still ? `${assetUrls(still.id).previewUrl}?blur=1` : null } : {}),
    // Locked bonus ads expose no full-res asset URLs at all (the asset routes refuse them too).
    assets: (locked ? [] : ad.assets.filter((a) => a.ratio !== PREVIEW_RATIO))
      .slice()
      .sort((a, b) => a.ratio.localeCompare(b.ratio))
      .map((a) => ({ id: a.id, ratio: a.ratio as Ratio, mime: a.mime, width: a.width, height: a.height, ...assetUrls(a.id) })),
  };
}

/** Record time-to-first-ad once (engine normally does this; the conditional update prevents double counting). */
async function backfillFirstAd(run: AdRun, ads: AdView[]): Promise<Date | null> {
  if (run.firstAdAt || !ads.some((a) => a.status === "ready")) return run.firstAdAt;
  const now = new Date();
  const res = await prisma.adRun.updateMany({ where: { id: run.id, firstAdAt: null }, data: { firstAdAt: now } });
  if (res.count === 1) {
    const already = await prisma.adsEvent.findFirst({ where: { runId: run.id, name: "first_ad_ready" }, select: { id: true } });
    if (!already) {
      const seconds = run.confirmedAt ? Math.round((now.getTime() - run.confirmedAt.getTime()) / 1000) : null;
      await trackAdsEvent("first_ad_ready", { workspaceId: run.workspaceId, userId: run.userId, runId: run.id, props: { seconds, source: "web" } });
    }
    return now;
  }
  return (await prisma.adRun.findUnique({ where: { id: run.id }, select: { firstAdAt: true } }))?.firstAdAt ?? null;
}


export async function loadRunView(runId: string): Promise<RunView | null> {
  const run = await prisma.adRun.findUnique({
    where: { id: runId },
    include: { ads: { include: { assets: true }, orderBy: { index: "asc" } }, brandProfile: { select: { logoKey: true } } },
  });
  if (!run) return null;
  // Ads the engine replaced after a failed quality check stay hidden: the replacement is shown instead.
  const visible = run.ads.filter((a) => !isReplacedAd(a.qcReport));
  const hasBonusRows = visible.some((a) => parseBonus(a.visualBrief));
  const unlocked = hasBonusRows || run.isTrial ? await isBonusUnlockedById(run.workspaceId) : false;
  const freeAds = run.isTrial && !unlocked ? freeTrialAdsFor(await isReferredWorkspace(run.workspaceId)) : null;
  const packLocked = freeAds === null ? new Set<string>() : trialLockedAdIds(run, visible, unlocked, freeAds);
  const ads = visible.map((a) => adView(a, unlocked, packLocked.has(a.id)));
  const bonusEnabled = trialBonusEnabled();
  const settled = ["completed", "partial"].includes(run.status);
  const bonusReadyLogged =
    bonusEnabled && run.isTrial && settled
      ? Boolean(await prisma.adsEvent.findFirst({ where: { runId: run.id, name: "bonus_ready" }, select: { id: true } }))
      : true;
  const pendingBonusAds = visible.filter((a) => parseBonus(a.visualBrief) && !["ready", "failed", "failed_qc"].includes(a.status)).length;
  const extraction = parseExtraction(run.extraction);
  const corrections = CorrectionsSchema.safeParse(run.corrections ?? {});
  const firstAdAt = await backfillFirstAd(run, ads);
  const hasLogo = Boolean(extraction?.logoKey || run.brandProfile?.logoKey);
  const [bridge, studioWs] = await Promise.all([studioBridgeEnabled(), prisma.adsWorkspace.findUnique({ where: { id: run.workspaceId }, select: { studioFreeVideos: true } })]);
  return {
    id: run.id,
    url: run.url,
    status: run.status,
    isTrial: run.isTrial,
    goal: run.goal,
    resolvedGoal: run.resolvedGoal,
    ratios: run.ratios.filter((r): r is Ratio => r === "4:5" || r === "1:1" || r === "9:16"),
    staticCount: run.staticCount,
    motionCount: run.motionCount,
    extraction,
    corrections: corrections.success ? corrections.data : null,
    logoUrl: hasLogo ? `/api/ads/runs/${run.id}/logo` : null,
    brandProfileId: run.brandProfileId,
    confirmDeadline: run.confirmDeadline?.toISOString() ?? null,
    confirmedAt: run.confirmedAt?.toISOString() ?? null,
    firstAdAt: firstAdAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    error: run.error,
    retriesLeft: Math.max(0, MAX_EXTRACT_RETRIES - (await extractRetriesUsed(run.id))),
    creditsReserved: run.creditsReserved,
    ads,
    serverNow: new Date().toISOString(),
    bonus: summarizeBonus(visible, unlocked),
    freeAds,
    lockedAds: ads.filter((a) => a.locked && !a.bonusKind && a.status === "ready").length,
    bonusPending:
      settled && shouldAwaitBonus({ enabled: bonusEnabled, isTrial: run.isTrial, completedAt: run.completedAt, bonusReadyLogged, pendingBonusAds, now: new Date() }),
    studio: { bridge, freeVideosLeft: studioWs?.studioFreeVideos ?? 0 },
  };
}

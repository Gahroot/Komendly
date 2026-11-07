import type { Ad, AdAsset, AdRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CorrectionsSchema, MAX_EXTRACT_RETRIES, type Ratio } from "./contracts";
import { trackAdsEvent } from "./events";
import { extractRetriesUsed, parseExtraction } from "./run-confirm";
import type { AdView, RunView } from "./run-types";

function assetUrls(id: string) {
  return { previewUrl: `/api/ads/assets/${id}/preview`, downloadUrl: `/api/ads/assets/${id}/download` };
}

function adView(ad: Ad & { assets: AdAsset[] }): AdView {
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
    assets: ad.assets
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

function isReplaced(qcReport: unknown): boolean {
  if (!qcReport || typeof qcReport !== "object") return false;
  const report = qcReport as { replacedBy?: unknown; replacementPending?: unknown };
  return Boolean(report.replacedBy) || report.replacementPending === true;
}

export async function loadRunView(runId: string): Promise<RunView | null> {
  const run = await prisma.adRun.findUnique({
    where: { id: runId },
    include: { ads: { include: { assets: true }, orderBy: { index: "asc" } }, brandProfile: { select: { logoKey: true } } },
  });
  if (!run) return null;
  // Ads the engine replaced after a failed quality check stay hidden: the replacement is shown instead.
  const ads = run.ads.filter((a) => !isReplaced(a.qcReport)).map(adView);
  const extraction = parseExtraction(run.extraction);
  const corrections = CorrectionsSchema.safeParse(run.corrections ?? {});
  const firstAdAt = await backfillFirstAd(run, ads);
  const hasLogo = Boolean(extraction?.logoKey || run.brandProfile?.logoKey);
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
  };
}

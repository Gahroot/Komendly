import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RATIOS } from "@/lib/ads/contracts";
import { metaAccess, metaActivateEnabled } from "@/lib/ads/meta/access";
import { metaPublishMode } from "@/lib/ads/meta/config";
import { publisherForWorkspace } from "@/lib/ads/meta/connection";
import { adsManagerUrl } from "@/lib/ads/meta/core/mapping";
import { DEFAULT_DAILY_BUDGET_MINOR } from "@/lib/ads/meta/core/publish";
import { qcPassed } from "@/lib/ads/meta/publish-request";
import { accountReadiness } from "@/lib/ads/meta/readiness";
import type { MetaCampaignView, MetaStatus } from "@/lib/ads/meta/status-types";
import { PREVIEW_RATIO } from "@/lib/ads/bonus-access";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

/** Thumbnail for the ad picker: the 4:5 feed image, else any real size, else the preview poster. The asset route still enforces locks. */
function thumbOf(assets: Array<{ id: string; ratio: string; mime: string }>): { thumb: string | null; thumbIsVideo: boolean } {
  const pick = assets.find((x) => x.ratio === "4:5")
    ?? assets.find((x) => (RATIOS as readonly string[]).includes(x.ratio))
    ?? assets.find((x) => x.ratio === PREVIEW_RATIO);
  return { thumb: pick ? `/api/ads/assets/${pick.id}/preview` : null, thumbIsVideo: !!pick?.mime.startsWith("video/") };
}

/** Campaigns Komendly published for this run, with what "Turn on" would spend and the latest activation state. */
async function loadCampaigns(runId: string, workspaceId: string): Promise<MetaCampaignView[]> {
  const rows = await prisma.metaPublish.findMany({
    where: { status: "published", campaignId: { not: null }, ad: { runId, workspaceId } },
    select: { campaignId: true, adSetId: true, adAccountId: true, jobId: true, createdAt: true }, orderBy: { createdAt: "desc" },
  });
  if (!rows.length) return [];
  const jobIds = [...new Set(rows.map((r) => r.jobId).filter((x): x is string => !!x))];
  const [publishJobs, activateJobs] = await Promise.all([
    prisma.adJob.findMany({ where: { id: { in: jobIds } }, select: { id: true, payload: true } }),
    prisma.adJob.findMany({ where: { runId, workspaceId, type: "activate_meta" }, orderBy: { createdAt: "desc" }, select: { payload: true, status: true, lastError: true } }),
  ]);
  const budgetOf = new Map(publishJobs.map((j) => [j.id, (j.payload as { budget?: unknown }).budget]));
  const byCampaign = new Map<string, typeof rows>();
  for (const r of rows) byCampaign.set(r.campaignId!, [...(byCampaign.get(r.campaignId!) ?? []), r]);
  return [...byCampaign].map(([campaignId, rs]) => {
    const budget = budgetOf.get(rs[0].jobId ?? "");
    const job = activateJobs.find((j) => (j.payload as { campaignId?: unknown }).campaignId === campaignId);
    const activation: MetaCampaignView["activation"] = !job ? "none"
      : job.status === "succeeded" ? "active"
      : job.status === "queued" || job.status === "running" ? "activating" : "failed";
    return {
      campaignId, adAccountId: rs[0].adAccountId,
      adSets: new Set(rs.map((r) => r.adSetId).filter(Boolean)).size, ads: rs.length,
      dailyBudgetMinor: typeof budget === "number" && budget > 0 ? budget : DEFAULT_DAILY_BUDGET_MINOR,
      activation, activationError: activation === "failed" ? job?.lastError?.slice(0, 300) ?? "Couldn't turn the ads on." : null,
      adsManagerUrl: rs[0].adAccountId ? adsManagerUrl(rs[0].adAccountId, campaignId) : null,
    };
  });
}

/** Everything the publish dialog needs for one run. `?accounts=1` also lists ad accounts + pages from Meta. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    if (!runId) throw new AdsHttpError(400, "invalid", "Missing run.");
    const { workspace } = await requireWorkspaceMember({ runId });
    const access = await metaAccess(workspace);
    if (access === "disabled") throw new AdsHttpError(404, "not_found", "Not found.");
    if (access === "upgrade") return NextResponse.json({ access });

    const [run, conn, ads, campaigns, canActivate] = await Promise.all([
      prisma.adRun.findUniqueOrThrow({ where: { id: runId }, select: { ratios: true, goal: true, resolvedGoal: true } }),
      prisma.metaConnection.findUnique({ where: { workspaceId: workspace.id } }),
      prisma.ad.findMany({
        where: { runId, workspaceId: workspace.id }, orderBy: { index: "asc" },
        select: { id: true, kind: true, index: true, headline: true, status: true, qcReport: true, assets: { select: { id: true, ratio: true, mime: true } },
          publishes: { orderBy: { createdAt: "desc" }, take: 6, select: { id: true, ratio: true, status: true, metaAdId: true, campaignId: true, adAccountId: true, error: true, createdAt: true } } },
      }),
      loadCampaigns(runId, workspace.id),
      metaActivateEnabled(workspace),
    ]);

    let accounts: Extract<MetaStatus, { access: "ok" }>["accounts"] = null;
    if (conn && url.searchParams.get("accounts") === "1") {
      try {
        const publisher = await publisherForWorkspace(workspace.id);
        try {
          const [adAccounts, pages] = await Promise.all([publisher.listAdAccounts(), publisher.listPages()]);
          accounts = { adAccounts: adAccounts.map((a) => ({ ...a, readiness: accountReadiness(a, pages) })), pages, readiness: accountReadiness(null, pages) };
        } finally {
          await publisher.close?.();
        }
      } catch (e) {
        accounts = { error: e instanceof Error ? e.message : "Couldn't load your Meta accounts." };
      }
    }

    return NextResponse.json({
      access,
      mode: metaPublishMode(),
      connected: !!conn,
      selection: conn ? { adAccountId: conn.adAccountId, pageId: conn.pageId } : null,
      accounts,
      ratios: RATIOS.filter((r) => run.ratios.includes(r)),
      goal: run.resolvedGoal ?? run.goal,
      canActivate,
      campaigns,
      ads: ads.map((a) => ({
        id: a.id, kind: a.kind, index: a.index, headline: a.headline,
        eligible: a.status === "ready" && qcPassed(a.qcReport),
        ratios: a.assets.map((x) => x.ratio).filter((r) => (RATIOS as readonly string[]).includes(r)),
        ...thumbOf(a.assets),
        publishes: a.publishes.map((p) => ({
          ...p, adsManagerUrl: p.adAccountId ? adsManagerUrl(p.adAccountId, p.campaignId ?? undefined) : null,
        })),
      })),
    });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

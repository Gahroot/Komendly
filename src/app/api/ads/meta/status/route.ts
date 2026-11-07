import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RATIOS } from "@/lib/ads/contracts";
import { metaAccess } from "@/lib/ads/meta/access";
import { metaPublishMode } from "@/lib/ads/meta/config";
import { publisherForWorkspace } from "@/lib/ads/meta/connection";
import { adsManagerUrl } from "@/lib/ads/meta/core/mapping";
import { qcPassed } from "@/lib/ads/meta/publish-request";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

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

    const [run, conn, ads] = await Promise.all([
      prisma.adRun.findUniqueOrThrow({ where: { id: runId }, select: { ratios: true } }),
      prisma.metaConnection.findUnique({ where: { workspaceId: workspace.id } }),
      prisma.ad.findMany({
        where: { runId, workspaceId: workspace.id }, orderBy: { index: "asc" },
        select: { id: true, kind: true, index: true, headline: true, status: true, qcReport: true, assets: { select: { ratio: true } },
          publishes: { orderBy: { createdAt: "desc" }, take: 6, select: { id: true, ratio: true, status: true, metaAdId: true, campaignId: true, adAccountId: true, error: true, createdAt: true } } },
      }),
    ]);

    let accounts: { adAccounts: Array<{ id: string; name: string }>; pages: Array<{ id: string; name: string }> } | { error: string } | null = null;
    if (conn && url.searchParams.get("accounts") === "1") {
      try {
        const publisher = await publisherForWorkspace(workspace.id);
        try {
          const [adAccounts, pages] = await Promise.all([publisher.listAdAccounts(), publisher.listPages()]);
          accounts = { adAccounts, pages };
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
      ads: ads.map((a) => ({
        id: a.id, kind: a.kind, index: a.index, headline: a.headline,
        eligible: a.status === "ready" && qcPassed(a.qcReport),
        ratios: a.assets.map((x) => x.ratio).filter((r) => (RATIOS as readonly string[]).includes(r)),
        publishes: a.publishes.map((p) => ({
          ...p, adsManagerUrl: p.adAccountId ? adsManagerUrl(p.adAccountId, p.campaignId ?? undefined) : null,
        })),
      })),
    });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

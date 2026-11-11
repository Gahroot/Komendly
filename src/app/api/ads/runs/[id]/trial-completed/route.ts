import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forwardAdsEventToMeta } from "@/lib/ads/meta-forward";
import { adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

/**
 * Meta CAPI "TrialCompleted" for a finished trial run. The engine records the run_completed AdsEvent itself
 * (it can't reach Meta with the browser's context), so the results page pings this once per run.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, workspace } = await requireWorkspaceMember({ runId: id });
    const run = await prisma.adRun.findUnique({ where: { id }, select: { isTrial: true, status: true } });
    if (run?.isTrial && (run.status === "completed" || run.status === "partial")) {
      await forwardAdsEventToMeta("run_completed", { workspaceId: workspace.id, userId: user.id, runId: id });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

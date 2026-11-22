import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { enqueueJob } from "@/lib/ads/jobs";
import { metaActivateEnabled, requireMetaAccess } from "@/lib/ads/meta/access";
import { loadMetaToken } from "@/lib/ads/meta/connection";
import { activationTargets } from "@/lib/ads/meta/core/activate";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

const ActivateSchema = z.object({ runId: z.string().min(1), campaignId: z.string().regex(/^\d+$/) });

/** "Turn on now": queues activate_meta for a campaign Komendly published for this run. Spends money once it runs. */
export async function POST(request: Request) {
  try {
    const parsed = ActivateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Missing campaign.");
    const { runId, campaignId } = parsed.data;
    const { user, workspace } = await requireWorkspaceMember({ runId });
    await requireMetaAccess(workspace);
    if (!(await metaActivateEnabled(workspace))) throw new AdsHttpError(404, "not_found", "Not found.");
    const rows = await prisma.metaPublish.findMany({
      where: { campaignId, status: "published", ad: { runId, workspaceId: workspace.id } },
      select: { campaignId: true, adSetId: true, metaAdId: true, status: true },
    });
    if (!activationTargets(rows, campaignId)) throw new AdsHttpError(404, "not_found", "We didn't create that campaign.");
    await loadMetaToken(workspace.id); // fail fast if not connected / expired
    const inFlight = await prisma.adJob.findFirst({
      where: { type: "activate_meta", runId, workspaceId: workspace.id, status: { in: ["queued", "running"] }, payload: { path: ["campaignId"], equals: campaignId } },
      select: { id: true },
    });
    if (inFlight) return NextResponse.json({ jobId: inFlight.id }, { status: 202 });
    if (!(await rateLimit(`meta_activate:${workspace.id}`, 10, 3600))) {
      throw new AdsHttpError(429, "rate_limited", "Too many requests. Try again in a while.");
    }
    const job = await enqueueJob({ type: "activate_meta", runId, workspaceId: workspace.id, payload: { campaignId, requestedBy: user.id }, priority: 5, maxAttempts: 2 });
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

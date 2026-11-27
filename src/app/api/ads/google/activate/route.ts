import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { enqueueJob } from "@/lib/ads/jobs";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { GOOGLE_JOBS } from "@/lib/ads/google/config";
import { requireGoogleConnection } from "@/lib/ads/google/connection";
import { buildGoogleActivatePayload } from "@/lib/ads/google/core/publish";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

const Body = z.object({ publishId: z.string().min(1), action: z.enum(["enable", "pause"]) });

/** "Start my ads" (spends money once it runs) or Pause, for a campaign Komendly created. */
export async function POST(request: Request) {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Please try again.");
    const row = await prisma.googlePublish.findUnique({ where: { id: parsed.data.publishId } });
    if (!row) throw new AdsHttpError(404, "not_found", "We didn't create that campaign.");
    const { user, workspace } = await requireWorkspaceMember({ workspaceId: row.workspaceId });
    await requireGoogleAccess(workspace);
    if (row.status !== "published" || !row.campaignResource) throw new AdsHttpError(409, "not_published", "This campaign isn't in Google Ads yet.");
    const conn = await requireGoogleConnection(workspace.id);
    if (conn.customerId !== row.customerId) throw new AdsHttpError(409, "account_changed", "This campaign is in a different Google Ads account. Open Google Ads to change it.");
    const inFlight = await prisma.adJob.findFirst({
      where: { type: GOOGLE_JOBS.activate, workspaceId: workspace.id, status: { in: ["queued", "running"] }, payload: { path: ["publishId"], equals: row.id } },
      select: { id: true },
    });
    if (inFlight) return NextResponse.json({ jobId: inFlight.id }, { status: 202 });
    if (!(await rateLimit(`google_activate:${workspace.id}`, 20, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many changes. Please wait a while and try again.");
    const job = await enqueueJob({
      type: GOOGLE_JOBS.activate, runId: row.runId, workspaceId: workspace.id, priority: 5, maxAttempts: 2,
      payload: buildGoogleActivatePayload({ publishId: row.id, action: parsed.data.action, customerId: row.customerId, loginCustomerId: conn.loginCustomerId, mode: conn.mode, campaignResource: row.campaignResource, requestedBy: user.id }),
    });
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

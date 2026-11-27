import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ads/abuse";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { readinessFor, requireGoogleConnection } from "@/lib/ads/google/connection";
import { normalizeCustomerId } from "@/lib/ads/google/core/types";
import { GooglePublishSchema, enqueueGooglePublish } from "@/lib/ads/google/publish-request";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

/** Queues publish_google (everything created PAUSED). 409 when a publish for this run is already queued/running. */
export async function POST(request: Request) {
  try {
    const parsed = GooglePublishSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Check your ad details and try again.");
    const { user, workspace } = await requireWorkspaceMember({ runId: parsed.data.runId });
    await requireGoogleAccess(workspace);
    const conn = await requireGoogleConnection(workspace.id);
    if (!conn.customerId || normalizeCustomerId(parsed.data.customerId) !== conn.customerId) {
      throw new AdsHttpError(409, "account_changed", "Your Google Ads account changed. Close this window and open it again.");
    }
    const readiness = await readinessFor(conn, { fresh: true });
    if (!readiness.canPublish) throw new AdsHttpError(409, "not_ready", readiness.blockers[0] ?? "Your Google Ads account isn't ready yet. Check the list in step Checks.");
    if (!(await rateLimit(`google_publish:${workspace.id}`, 10, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many tries. Please wait a while and try again.");
    const result = await enqueueGooglePublish(parsed.data, {
      workspaceId: workspace.id, userId: user.id,
      conn: { mode: conn.mode, customerId: conn.customerId, loginCustomerId: conn.loginCustomerId, currency: conn.currency },
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

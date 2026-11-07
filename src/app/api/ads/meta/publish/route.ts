import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/ads/abuse";
import { requireMetaAccess } from "@/lib/ads/meta/access";
import { loadMetaToken } from "@/lib/ads/meta/connection";
import { PublishRequestSchema, enqueueMetaPublish } from "@/lib/ads/meta/publish-request";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function POST(request: Request) {
  try {
    const parsed = PublishRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Check the publish settings and try again.");
    const { user, workspace } = await requireWorkspaceMember({ runId: parsed.data.runId });
    await requireMetaAccess(workspace);
    await loadMetaToken(workspace.id); // fail fast if not connected / expired
    if (!(await rateLimit(`meta_publish:${workspace.id}`, 10, 3600))) {
      throw new AdsHttpError(429, "rate_limited", "Too many publish requests. Try again in a while.");
    }
    const result = await enqueueMetaPublish(parsed.data, { workspaceId: workspace.id, userId: user.id });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { loadGoogleConnection } from "@/lib/ads/google/connection";
import { DraftRequestSchema, buildGoogleDraft } from "@/lib/ads/google/draft-request";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function POST(request: Request) {
  try {
    const parsed = DraftRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Please try again.");
    const { workspace } = await requireWorkspaceMember({ runId: parsed.data.runId });
    await requireGoogleAccess(workspace);
    const conn = await loadGoogleConnection(workspace.id);
    return NextResponse.json(await buildGoogleDraft(parsed.data.runId, parsed.data.adIds, { workspaceId: workspace.id, currency: conn?.currency ?? null }));
  } catch (error) {
    return adsErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { disconnectGoogle } from "@/lib/ads/google/connection";
import { adsErrorResponse, getOrCreateWorkspace, requireUser, requireWorkspaceMember } from "@/lib/ads/workspace";

/** Removes Komendly's access (revokes the Google sign-in). Campaigns already in Google Ads stay there. */
export async function POST() {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    await requireWorkspaceMember({ workspaceId: workspace.id });
    await disconnectGoogle(workspace.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

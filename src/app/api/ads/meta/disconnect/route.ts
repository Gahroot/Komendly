import { NextResponse } from "next/server";
import { disconnectMeta } from "@/lib/ads/meta/connection";
import { pauseTeamBeforeDisconnect } from "@/lib/ads/team/stop";
import { adsErrorResponse, getOrCreateWorkspace, requireUser, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function POST() {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    await requireWorkspaceMember({ workspaceId: workspace.id });
    // Ozzy's team: mark needs_reconnect and pause the campaign while the token still works, then revoke.
    await pauseTeamBeforeDisconnect(workspace.id);
    await disconnectMeta(workspace.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

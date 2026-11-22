import { NextResponse } from "next/server";
import { disconnectMeta } from "@/lib/ads/meta/connection";
import { pauseTeamBeforeDisconnect } from "@/lib/ads/team/stop";
import { adsErrorResponse, getOrCreateWorkspace, requireUser, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function POST() {
  try {
    const user = await requireUser();
    const workspace = await getOrCreateWorkspace(user);
    await requireWorkspaceMember({ workspaceId: workspace.id });
    // Ozzy's team: mark needs_reconnect and pause the campaign while the token still works, then revoke.
    await pauseTeamBeforeDisconnect(workspace.id);
    // Partner rows are never revoked (disconnectMeta); an admin's own grant backs every partner customer, so keep it too.
    await disconnectMeta(workspace.id, { revoke: !user.isAdmin });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { requireMetaAccess } from "@/lib/ads/meta/access";
import { metaAppConfig, metaPublishMode } from "@/lib/ads/meta/config";
import { startMetaConnect } from "@/lib/ads/meta/oauth-flow";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

export async function GET() {
  try {
    const user = await requireUser();
    const workspace = await getOrCreateWorkspace(user);
    await requireMetaAccess(workspace);
    const url = await startMetaConnect({ config: metaAppConfig(), mode: metaPublishMode(), workspaceId: workspace.id, userId: user.id });
    return NextResponse.redirect(url);
  } catch (error) {
    return adsErrorResponse(error);
  }
}

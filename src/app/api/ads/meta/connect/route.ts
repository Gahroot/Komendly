import { NextResponse } from "next/server";
import { requireMetaAccess } from "@/lib/ads/meta/access";
import { metaAppConfig, metaPublishMode } from "@/lib/ads/meta/config";
import { partnerConnectTarget, startMetaConnect } from "@/lib/ads/meta/oauth-flow";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

/** `?forWorkspace=<id>` (admins only): connect Komendly's own Meta login to a customer workspace via partner access. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const forWorkspace = new URL(request.url).searchParams.get("forWorkspace");
    if (forWorkspace) {
      const workspaceId = await partnerConnectTarget(user, forWorkspace);
      // Graph mode always: the team engine and the partner asset listing speak the Marketing API.
      return NextResponse.redirect(await startMetaConnect({ config: metaAppConfig(), mode: "graph", workspaceId, userId: user.id, viaPartner: true }));
    }
    const workspace = await getOrCreateWorkspace(user);
    await requireMetaAccess(workspace);
    const url = await startMetaConnect({ config: metaAppConfig(), mode: metaPublishMode(), workspaceId: workspace.id, userId: user.id });
    return NextResponse.redirect(url);
  } catch (error) {
    return adsErrorResponse(error);
  }
}

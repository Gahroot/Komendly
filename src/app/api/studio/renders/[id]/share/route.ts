import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appBaseUrl } from "@/lib/ads/mailer";
import { AdsHttpError, adsErrorResponse, requireWorkspaceMember } from "@/lib/ads/workspace";
import { trackAdsEvent } from "@/lib/ads/events";

type Ctx = { params: Promise<{ id: string }> };

/** Create (or reuse) the public share link /s/<token> for a render. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const render = await prisma.studioRender.findUnique({ where: { id: (await params).id }, select: { id: true, workspaceId: true, shareToken: true } });
    if (!render) throw new AdsHttpError(404, "not_found", "Not found.");
    const { user } = await requireWorkspaceMember({ workspaceId: render.workspaceId });
    let token = render.shareToken;
    if (!token) {
      const fresh = randomBytes(9).toString("base64url");
      await prisma.studioRender.updateMany({ where: { id: render.id, shareToken: null }, data: { shareToken: fresh } });
      token = (await prisma.studioRender.findUniqueOrThrow({ where: { id: render.id }, select: { shareToken: true } })).shareToken;
      await trackAdsEvent("studio_share_created", { workspaceId: render.workspaceId, userId: user.id, props: { renderId: render.id, token } });
    }
    return NextResponse.json({ token, url: `${appBaseUrl(request.nextUrl.origin)}/s/${token}` });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/ads/storage";
import { AdsHttpError, adsErrorResponse, requireUser } from "@/lib/ads/workspace";
import { workspaceOwnsKey } from "@/lib/studio/server";

/**
 * Signed playback: 302 to a short-lived S3 URL. Either ?key=studio/<workspaceId>/... (must be one of the caller's
 * workspaces) or ?render=<id>&kind=video|poster. &download=1 forces a file download.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const sp = request.nextUrl.searchParams;
    let key = sp.get("key");
    let downloadName: string | undefined;
    const renderId = sp.get("render");
    if (renderId) {
      const r = await prisma.studioRender.findUnique({ where: { id: renderId }, select: { key: true, posterKey: true, version: true, ratio: true } });
      if (!r) throw new AdsHttpError(404, "not_found", "Not found.");
      key = sp.get("kind") === "poster" ? r.posterKey : r.key;
      if (sp.get("download") === "1") downloadName = `ozzy-v${r.version}-${r.ratio.replace(":", "x")}.mp4`;
    } else if (key && sp.get("download") === "1") {
      downloadName = key.split("/").pop();
    }
    if (!key || key.length > 512 || !(await workspaceOwnsKey(user.id, key))) throw new AdsHttpError(404, "not_found", "Not found.");
    const url = await presignGet(key, { seconds: 600, downloadName });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

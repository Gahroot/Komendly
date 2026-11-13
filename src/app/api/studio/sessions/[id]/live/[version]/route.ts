import { NextResponse } from "next/server";
import { AdsHttpError, adsErrorResponse } from "@/lib/ads/workspace";
import { studioKeys } from "@/lib/studio/contracts";
import { isLiveVersion, liveEntryPath } from "@/lib/studio/live";
import { readLiveManifest } from "@/lib/studio/live-server";
import { requireStudioSession } from "@/lib/studio/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; version: string }> };

/**
 * Live preview entry (session owner's workspace only): 302 to the version's files under /api/studio/live/..., whose
 * path carries the version's capability token so the sandboxed player (no cookies) can load relative assets.
 */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { id, version } = await params;
    const { session } = await requireStudioSession(id);
    if (!isLiveVersion(version)) throw new AdsHttpError(404, "not_found", "Not found.");
    const manifest = await readLiveManifest(studioKeys.liveManifest(session.workspaceId, session.id, version), request.signal);
    if (!manifest) throw new AdsHttpError(404, "not_found", "Not found.");
    return NextResponse.redirect(new URL(liveEntryPath(session.id, version, manifest), request.url), { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

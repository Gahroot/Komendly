import { prisma } from "@/lib/prisma";
import { studioKeys } from "@/lib/studio/contracts";
import { isLiveVersion, liveFileFor, liveHeaders, liveTokenMatches, parseRange } from "@/lib/studio/live";
import { getLiveObject, readLiveManifest } from "@/lib/studio/live-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sessionId: string; version: string; token: string; path: string[] }> };

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * Live preview files for the sandboxed player. Public in middleware because a sandboxed iframe sends no cookies:
 * every request must carry the version's random token (handed out only by the owner-authenticated entry route), and
 * only files listed in that version's manifest are served, streamed from storage (Range supported for media).
 */
export async function GET(request: Request, { params }: Ctx) {
  const { sessionId, version, token, path } = await params;
  if (!isLiveVersion(version) || !/^[\w-]{16,100}$/.test(token) || sessionId.length > 64) return notFound();
  const session = await prisma.studioSession.findUnique({ where: { id: sessionId }, select: { id: true, workspaceId: true } });
  if (!session) return notFound();
  const manifest = await readLiveManifest(studioKeys.liveManifest(session.workspaceId, session.id, version), request.signal);
  if (!manifest || !liveTokenMatches(manifest, token)) return notFound();
  const file = liveFileFor(manifest, path);
  if (!file) return notFound();
  const size = manifest.files[file.rel]?.size ?? 0;
  const range = size > 0 ? parseRange(request.headers.get("range"), size) : null;
  if (range === "invalid") return new Response(null, { status: 416, headers: { ...liveHeaders(file.type), "Content-Range": `bytes */${size}` } });
  const obj = await getLiveObject(file.key, range, request.signal);
  if (!obj) return notFound();
  const headers: Record<string, string> = liveHeaders(file.type);
  if (obj.length !== undefined) headers["Content-Length"] = String(obj.length);
  if (range) headers["Content-Range"] = obj.contentRange ?? `bytes ${range.start}-${range.end}/${size}`;
  return new Response(obj.body, { status: range ? 206 : 200, headers });
}

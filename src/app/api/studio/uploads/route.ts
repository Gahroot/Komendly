import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { AdsHttpError, adsErrorResponse, isPaidWorkspace } from "@/lib/ads/workspace";
import { studioKeys, STUDIO_UPLOAD_LIMITS } from "@/lib/studio/contracts";
import { studioAccess, uploadView } from "@/lib/studio/server";
import { presignPut } from "@/lib/studio/storage";
import { trackAdsEvent } from "@/lib/ads/events";

const Body = z.object({
  filename: z.string().trim().min(1).max(200),
  mime: z.string().max(80),
  bytes: z.number().int().positive(),
  sessionId: z.string().max(64).optional(),
});

const MB = 1024 * 1024;

/** Start an upload: validate type/size (free vs paid), create StudioUpload(pending), return a presigned PUT (<= 10 min). */
export async function POST(request: NextRequest) {
  try {
    const { user, workspace } = await studioAccess();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "That file can't be uploaded.");
    const { filename, mime, bytes, sessionId } = parsed.data;
    if (!(STUDIO_UPLOAD_LIMITS.mimes as readonly string[]).includes(mime)) {
      throw new AdsHttpError(415, "unsupported_type", "Ozzy can use MP4, MOV, WebM, PNG, JPG, WebP, MP3, WAV or M4A files.");
    }
    const paid = isPaidWorkspace(workspace);
    const max = paid ? STUDIO_UPLOAD_LIMITS.maxBytes : STUDIO_UPLOAD_LIMITS.maxBytesFree;
    if (bytes > max) {
      throw new AdsHttpError(413, "too_large", `Files can be up to ${max / MB} MB${paid ? "" : ` on the free plan (${STUDIO_UPLOAD_LIMITS.maxBytes / MB} MB on paid plans)`}.`, { maxBytes: max, paid });
    }
    if (sessionId) {
      const s = await prisma.studioSession.findFirst({ where: { id: sessionId, workspaceId: workspace.id }, select: { id: true } });
      if (!s) throw new AdsHttpError(404, "not_found", "Not found.");
    }
    if (!(await rateLimit(`studio-uploads:${user.id}`, 60, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many uploads this hour. Try again soon.");
    const id = randomUUID().replace(/-/g, "");
    const key = studioKeys.upload(workspace.id, id, filename);
    const upload = await prisma.studioUpload.create({ data: { id, workspaceId: workspace.id, userId: user.id, sessionId: sessionId ?? null, key, filename, mime, bytes, status: "pending" } });
    const putUrl = await presignPut(key, mime);
    await trackAdsEvent("studio_upload", { workspaceId: workspace.id, userId: user.id, props: { mime, bytes } });
    return NextResponse.json({ upload: uploadView(upload), putUrl, headers: { "Content-Type": mime } }, { status: 201 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

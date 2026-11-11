import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdsHttpError, adsErrorResponse, isPaidWorkspace } from "@/lib/ads/workspace";
import { PRIORITY } from "@/lib/ads/run";
import { STUDIO_PROBE_JOB_TYPE, STUDIO_UPLOAD_LIMITS } from "@/lib/studio/contracts";
import { studioAccess, uploadView } from "@/lib/studio/server";
import { headObjectSize } from "@/lib/studio/storage";

type Ctx = { params: Promise<{ id: string }> };

/** The browser finished its PUT: verify the object, mark uploaded, enqueue a probe (duration/poster). Idempotent. */
export async function POST(_request: NextRequest, { params }: Ctx) {
  try {
    const { workspace } = await studioAccess();
    const upload = await prisma.studioUpload.findFirst({ where: { id: (await params).id, workspaceId: workspace.id } });
    if (!upload) throw new AdsHttpError(404, "not_found", "Not found.");
    if (upload.status !== "pending") return NextResponse.json({ upload: uploadView(upload) });
    const size = await headObjectSize(upload.key);
    if (size === null) throw new AdsHttpError(409, "not_uploaded", "The upload didn't finish. Try again.");
    if (size > STUDIO_UPLOAD_LIMITS.maxBytes) throw new AdsHttpError(413, "too_large", "That file is too large.");
    const updated = await prisma.$transaction(async (tx) => {
      const won = await tx.studioUpload.updateMany({ where: { id: upload.id, status: "pending" }, data: { status: "uploaded", bytes: size || upload.bytes } });
      if (won.count === 1) {
        await tx.adJob.create({
          data: { type: STUDIO_PROBE_JOB_TYPE, workspaceId: workspace.id, payload: { uploadId: upload.id }, priority: isPaidWorkspace(workspace) ? PRIORITY.paid : PRIORITY.trial },
        });
      }
      return tx.studioUpload.findUniqueOrThrow({ where: { id: upload.id } });
    });
    return NextResponse.json({ upload: uploadView(updated) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

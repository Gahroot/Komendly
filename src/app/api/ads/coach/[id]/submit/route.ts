import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import { CoachFileSchema } from "@/lib/ads/coach/contracts";
import { enqueueCoachJob, reviewView } from "@/lib/ads/coach/server";
import { headObjectSize } from "@/lib/studio/storage";

/** Uploads finished: check every file landed (and isn't bigger than declared), then queue Ozzy. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const { id } = await params;
    const r = await prisma.adCoachReview.findFirst({ where: { id, workspaceId: ws.id } });
    if (!r) throw new AdsHttpError(404, "not_found", "Not found.");
    if (r.status !== "uploading") return NextResponse.json({ review: reviewView(r) });
    const files = z.array(CoachFileSchema).parse(r.files);
    const sizes = await Promise.all(files.map((f) => headObjectSize(f.key)));
    if (sizes.some((s, i) => s === null || s > (files[i]?.bytes ?? 0))) throw new AdsHttpError(400, "upload_incomplete", "Some files didn't finish uploading. Try again.");
    const claimed = await prisma.adCoachReview.updateMany({ where: { id: r.id, status: "uploading" }, data: { status: "queued" } });
    if (claimed.count === 1) {
      await enqueueCoachJob(r);
      await trackAdsEvent("coach_upload", { workspaceId: ws.id, userId: user.id, props: { reviewId: r.id, kind: r.kind, files: files.length, free: r.free, note: !!r.note } });
    }
    const fresh = await prisma.adCoachReview.findUniqueOrThrow({ where: { id: r.id } });
    return NextResponse.json({ review: reviewView(fresh) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

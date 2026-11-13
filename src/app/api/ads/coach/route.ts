import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { trackAdsEvent } from "@/lib/ads/events";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import { coachUploadKey, COACH_LIMITS, normalizeMime, uploadKind } from "@/lib/ads/coach/contracts";
import { loadCoachAccess, reviewView, seedTarget } from "@/lib/ads/coach/server";
import type { CoachHome } from "@/lib/ads/coach/view";
import { presignPut } from "@/lib/studio/storage";

/** Coach home: access mode, past check-ups, default website for "Make 5 more". */
export async function GET() {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const [access, rows, target] = await Promise.all([
      loadCoachAccess(ws, new Date()),
      prisma.adCoachReview.findMany({ where: { workspaceId: ws.id, status: { not: "uploading" } }, orderBy: { createdAt: "desc" }, take: 20 }),
      seedTarget(ws, null),
    ]);
    if (!access.canReview && access.reason !== "daily_limit") {
      await trackAdsEvent("coach_upsell_shown", { workspaceId: ws.id, userId: user.id, props: { reason: access.reason } });
    }
    const body: CoachHome = { access, reviews: rows.map(reviewView), defaultUrl: target?.url ?? null };
    return NextResponse.json(body);
  } catch (error) {
    return adsErrorResponse(error);
  }
}

const Body = z.object({
  files: z.array(z.object({ name: z.string().trim().min(1).max(200), mime: z.string().max(120), bytes: z.number().int().positive() })).min(1).max(COACH_LIMITS.maxScreenshots),
  note: z.string().trim().max(COACH_LIMITS.noteMax).optional(),
});

/** Start a check-up: validate files + access, create the review, return presigned PUTs (<= 10 min). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Those files can't be checked. Try screenshots or a CSV export.");
    const ws = await getOrCreateWorkspace(user);
    if (ws.suspendedAt) throw new AdsHttpError(403, "suspended", "This account is paused.");
    const files = parsed.data.files.map((f) => ({ ...f, mime: normalizeMime(f.name, f.mime) }));
    const kind = uploadKind(files);
    if (!kind.ok) throw new AdsHttpError(400, "invalid_files", kind.message);
    const access = await loadCoachAccess(ws, new Date());
    if (!access.canReview) {
      if (access.reason === "daily_limit") throw new AdsHttpError(429, "daily_limit", `That's ${COACH_LIMITS.perDay} check-ups today. Ozzy will be ready for more tomorrow.`);
      await trackAdsEvent("coach_upsell_shown", { workspaceId: ws.id, userId: user.id, props: { reason: access.reason, at: "upload" } });
      throw new AdsHttpError(402, "upgrade", "Unlimited check-ups come with Ozzy Ad Department.", { upgradeUrl: "/ads/pricing" });
    }
    if (!(await rateLimit(`coach:${user.id}`, 20, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many uploads this hour. Try again soon.");
    const review = await prisma.adCoachReview.create({
      data: { workspaceId: ws.id, userId: user.id, kind: kind.kind, status: "uploading", note: parsed.data.note || null, free: access.mode === "one_free" },
    });
    const withKeys = files.map((f, i) => ({ key: coachUploadKey(ws.id, review.id, i, f.name), mime: f.mime, bytes: f.bytes, name: f.name }));
    await prisma.adCoachReview.update({ where: { id: review.id }, data: { files: withKeys } });
    const uploads = await Promise.all(withKeys.map(async (f) => ({ name: f.name, putUrl: await presignPut(f.key, f.mime), headers: { "Content-Type": f.mime } })));
    return NextResponse.json({ reviewId: review.id, uploads }, { status: 201 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

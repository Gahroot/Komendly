import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { fingerprintFrom } from "@/lib/ads/run";
import { startRun } from "@/lib/ads/run-start";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, isPaidWorkspace, requireUser } from "@/lib/ads/workspace";
import { CoachVerdictSchema } from "@/lib/ads/coach/contracts";
import { seedFor, seedTarget } from "@/lib/ads/coach/server";

const Body = z.object({ url: z.string().trim().min(3).max(2048).optional() });

/** "Make 5 more like the winner": a normal paid run (5 statics, credits like any run; 0 on unlimited plans), seeded from the winner. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    if (!isPaidWorkspace(ws)) throw new AdsHttpError(402, "upgrade", "Pick a plan to make more ads like your winner.", { upgradeUrl: "/ads/pricing" });
    const { id } = await params;
    const parsed = Body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Enter your website.");
    const review = await prisma.adCoachReview.findFirst({ where: { id, workspaceId: ws.id } });
    if (!review) throw new AdsHttpError(404, "not_found", "Not found.");
    if (review.moreRunId) return NextResponse.json({ runId: review.moreRunId, resumed: true });
    const seed = await seedFor(ws, review);
    if (!seed) throw new AdsHttpError(400, "no_winner", "There's no clear winner yet, so there's nothing to copy.");
    const v = CoachVerdictSchema.parse(review.verdict);
    const target = parsed.data.url ? { url: parsed.data.url } : await seedTarget(ws, v.winner?.matchedAdId ?? null);
    if (!target) throw new AdsHttpError(400, "need_url", "What's your website? Ozzy needs it to make the new ads.");
    const result = await startRun({ ...target, count: 5, ratios: ["4:5"], seed }, { user, workspace: ws, fp: fingerprintFrom(request) });
    // Unique moreRunId: a double click that slipped past the check above loses here (its run stays a normal run).
    await prisma.adCoachReview.updateMany({ where: { id: review.id, moreRunId: null }, data: { moreRunId: result.runId } });
    await trackAdsEvent("coach_more_like_winner", { workspaceId: ws.id, userId: user.id, runId: result.runId, props: { reviewId: review.id, matched: !!seed.sourceAdId } });
    return NextResponse.json({ runId: result.runId, resumed: false }, { status: 201 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

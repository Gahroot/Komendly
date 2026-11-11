/**
 * Actor recommendation for a review.
 * POST { reviewId } enqueues the engine's Codex ranking and returns the instant keyword ranking.
 * GET ?reviewId= returns the Codex ranking when ready, else the keyword ranking + job status.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { enqueueRecommendation, getRecommendation } from "@/lib/testimonial/recommend";

const Body = z.object({ reviewId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "reviewId is required" }, { status: 400 });
    const current = await getRecommendation(user.id, parsed.data.reviewId);
    if (!current) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    if (current.status === "ready") return NextResponse.json(current);
    const jobId = await enqueueRecommendation(user.id, parsed.data.reviewId);
    return NextResponse.json({ ...current, status: current.status === "none" || current.status === "failed" ? "queued" : current.status, jobId });
  } catch (error) {
    logger.error({ error }, "Failed to enqueue actor recommendation");
    return NextResponse.json({ error: "Failed to recommend actors" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const reviewId = new URL(request.url).searchParams.get("reviewId");
    if (!reviewId) return NextResponse.json({ error: "reviewId is required" }, { status: 400 });
    const r = await getRecommendation(user.id, reviewId);
    if (!r) return NextResponse.json({ error: "Review not found" }, { status: 404 });
    return NextResponse.json(r);
  } catch (error) {
    logger.error({ error }, "Failed to read actor recommendation");
    return NextResponse.json({ error: "Failed to recommend actors" }, { status: 500 });
  }
}

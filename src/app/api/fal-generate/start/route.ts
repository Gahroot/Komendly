/**
 * FAL Generate Start API
 * Validates, checks entitlement, reserves minutes, creates the composite video + provisional
 * clips and enqueues a `testimonial_generate` job. The engine (Railway) does the generation.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { segmentScript, simpleSegmentScript, validateSegmentation } from "@/lib/fal-lipsync";
import type { FalGenerateStartResponse } from "@/lib/fal-lipsync/types";
import { canGenerateVideo, reserveGenerationMinutes } from "@/lib/subscription";
import {
  TESTIMONIAL_JOB_TYPE,
  minutesForDuration,
  templateScript,
  type TestimonialJobPayload,
} from "@/lib/testimonial/contracts";

const StartSchema = z.object({
  reviewId: z.string().min(1),
  actorId: z.string().min(1),
  targetDuration: z.number().int().min(8).max(120).default(30),
  aspectRatio: z.enum(["9:16", "16:9"]).default("9:16"),
  voiceId: z.string().max(200).optional(),
  useAIScript: z.boolean().default(true),
  customScript: z.string().trim().min(1).max(4000).optional(),
});

class NotEntitledError extends Error {}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = StartSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "reviewId and actorId are required" }, { status: 400 });
    }
    const { reviewId, actorId, targetDuration, aspectRatio, voiceId, useAIScript, customScript } = parsed.data;

    const review = await prisma.review.findFirst({ where: { id: reviewId, userId: user.id } });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    const actor = await prisma.falActor.findFirst({ where: { id: actorId, isActive: true } });
    if (!actor) {
      return NextResponse.json({ error: "Actor not found" }, { status: 404 });
    }

    // Deduplication: an in-progress video for this review is returned as-is (no second charge).
    const existingVideo = await prisma.falCompositeVideo.findFirst({
      where: { reviewId: review.id, userId: user.id, status: { in: ["pending", "generating_clips", "stitching"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existingVideo) {
      const response: FalGenerateStartResponse = {
        success: true,
        compositeVideoId: existingVideo.id,
        status: existingVideo.status as "pending" | "generating_clips" | "stitching",
        estimatedTime: (existingVideo.totalClips - existingVideo.currentClip) * 60,
      };
      return NextResponse.json(response);
    }

    const minutes = minutesForDuration(targetDuration);
    const entitlement = await canGenerateVideo(user.id, minutes);
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: entitlement.reason ?? "Not entitled", remainingMinutes: entitlement.remainingMinutes ?? 0 },
        { status: 402 }
      );
    }

    // Provisional script/clips so the status page has something to show; the engine rewrites
    // them (Codex script, audio chunks) before generating any clip.
    const fullScript = customScript ?? templateScript(review.reviewText, review.businessName);
    let segmentResult = segmentScript(fullScript, { targetTotalDuration: targetDuration, maxClipDuration: 10 });
    if (!validateSegmentation(segmentResult).valid) segmentResult = simpleSegmentScript(fullScript);

    const payloadBase = { useAIScript, ...(customScript ? { customScript } : {}) };

    const compositeVideo = await prisma.$transaction(async (tx) => {
      if (!(await reserveGenerationMinutes(tx, user.id, minutes))) throw new NotEntitledError();
      const video = await tx.falCompositeVideo.create({
        data: {
          userId: user.id,
          reviewId: review.id,
          actorId: actor.id,
          fullScript,
          hookScript: segmentResult.segments.find((s) => s.type === "hook")?.content ?? "",
          testimonialScript: segmentResult.segments.filter((s) => s.type === "testimonial").map((s) => s.content).join(" "),
          ctaScript: segmentResult.segments.find((s) => s.type === "cta")?.content ?? "",
          aspectRatio,
          targetDuration,
          voiceId: voiceId ?? actor.voiceId ?? "nova",
          status: "pending",
          totalClips: segmentResult.clipCount,
          minutesReserved: minutes,
          minutesState: "reserved",
          scriptSource: customScript ? "custom" : null,
        },
      });
      await tx.falClip.createMany({
        data: segmentResult.segments.map((segment) => ({
          compositeVideoId: video.id,
          clipType: segment.type,
          clipIndex: segment.order,
          scriptContent: segment.content,
          status: "pending",
        })),
      });
      const payload: TestimonialJobPayload = { compositeVideoId: video.id, ...payloadBase };
      const job = await tx.adJob.create({
        data: { type: TESTIMONIAL_JOB_TYPE, payload, priority: 100, maxAttempts: 3 },
        select: { id: true },
      });
      return tx.falCompositeVideo.update({ where: { id: video.id }, data: { jobId: job.id } });
    }).catch((e: unknown) => {
      if (e instanceof NotEntitledError) return null;
      throw e;
    });

    if (!compositeVideo) {
      return NextResponse.json({ error: "Insufficient minutes" }, { status: 402 });
    }

    logger.info(
      { compositeVideoId: compositeVideo.id, clipCount: segmentResult.clipCount, targetDuration, minutes },
      "Testimonial video job enqueued"
    );

    const response: FalGenerateStartResponse & { jobId: string | null; minutesReserved: number } = {
      success: true,
      compositeVideoId: compositeVideo.id,
      status: "pending",
      estimatedTime: segmentResult.clipCount * 60,
      jobId: compositeVideo.jobId,
      minutesReserved: minutes,
    };
    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, "Failed to start FAL video generation");
    return NextResponse.json({ error: "Failed to start video generation" }, { status: 500 });
  }
}

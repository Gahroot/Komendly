/**
 * FAL Generate Start API
 * Start a new composite video generation
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { generateUGCScript, generateSimpleScript } from "@/lib/openai-script";
import { segmentScript, simpleSegmentScript, validateSegmentation } from "@/lib/fal-lipsync";
import type { FalGenerateStartResponse } from "@/lib/fal-lipsync/types";

interface StartRequest {
  reviewId: string;
  actorId: string;
  targetDuration?: number;
  aspectRatio?: "9:16" | "16:9";
  voiceId?: string;
  useAIScript?: boolean;
  customScript?: string;
}

export async function POST(request: Request) {
  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: StartRequest = await request.json();
    const { reviewId, actorId, targetDuration = 30, aspectRatio = "9:16", voiceId, useAIScript = true, customScript } = body;

    // Validate required fields
    if (!reviewId || !actorId) {
      return NextResponse.json(
        { error: "reviewId and actorId are required" },
        { status: 400 }
      );
    }

    // Fetch review
    const review = await prisma.review.findFirst({
      where: { id: reviewId, userId: user.id },
    });

    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }

    // Fetch actor
    const actor = await prisma.falActor.findFirst({
      where: { id: actorId, isActive: true },
    });

    if (!actor) {
      return NextResponse.json({ error: "Actor not found" }, { status: 404 });
    }

    // Generate or use custom script
    let fullScript: string;

    if (customScript) {
      fullScript = customScript;
    } else if (useAIScript) {
      try {
        fullScript = await generateUGCScript(review.reviewText, targetDuration);
      } catch {
        logger.warn("AI script generation failed, using simple script");
        fullScript = generateSimpleScript(
          review.reviewText,
          review.reviewerName,
          review.businessName
        );
      }
    } else {
      fullScript = generateSimpleScript(
        review.reviewText,
        review.reviewerName,
        review.businessName
      );
    }

    // Segment the script
    let segmentResult = segmentScript(fullScript, {
      targetTotalDuration: targetDuration,
      maxClipDuration: 10,
    });

    // Validate segmentation
    const validation = validateSegmentation(segmentResult);
    if (!validation.valid) {
      logger.warn({ errors: validation.errors }, "Segmentation validation failed, using simple segmentation");
      segmentResult = simpleSegmentScript(fullScript);
    }

    // Determine voice
    const selectedVoiceId = voiceId ?? actor.voiceId ?? "nova";

    // Create composite video record
    const compositeVideo = await prisma.falCompositeVideo.create({
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
        voiceId: selectedVoiceId,
        status: "pending",
        totalClips: segmentResult.clipCount,
      },
    });

    // Create clip records
    for (const segment of segmentResult.segments) {
      await prisma.falClip.create({
        data: {
          compositeVideoId: compositeVideo.id,
          clipType: segment.type,
          clipIndex: segment.order,
          scriptContent: segment.content,
          status: "pending",
        },
      });
    }

    // Start background processing (in a real implementation, this would be a queue job)
    // For now, we just mark as generating_clips - actual generation happens via polling/webhook

    await prisma.falCompositeVideo.update({
      where: { id: compositeVideo.id },
      data: { status: "generating_clips" },
    });

    logger.info(
      {
        compositeVideoId: compositeVideo.id,
        clipCount: segmentResult.clipCount,
        targetDuration,
      },
      "FAL composite video generation started"
    );

    const response: FalGenerateStartResponse = {
      success: true,
      compositeVideoId: compositeVideo.id,
      status: "generating_clips",
      estimatedTime: segmentResult.clipCount * 60, // ~60 seconds per clip estimate
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, "Failed to start FAL video generation");
    return NextResponse.json(
      { error: "Failed to start video generation" },
      { status: 500 }
    );
  }
}

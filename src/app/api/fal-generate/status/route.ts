/**
 * FAL Generate Status API
 * Check status of composite video generation
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { FalGenerateStatusResponse, ClipProgress, ClipStatus } from "@/lib/fal-lipsync/types";

export async function GET(request: Request) {
  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get composite video ID from query
    const url = new URL(request.url);
    const compositeVideoId = url.searchParams.get("id");

    if (!compositeVideoId) {
      return NextResponse.json(
        { error: "Composite video ID is required" },
        { status: 400 }
      );
    }

    // Fetch composite video with clips
    const compositeVideo = await prisma.falCompositeVideo.findFirst({
      where: { id: compositeVideoId, userId: user.id },
      include: {
        clips: {
          orderBy: { clipIndex: "asc" },
        },
      },
    });

    if (!compositeVideo) {
      return NextResponse.json(
        { error: "Composite video not found" },
        { status: 404 }
      );
    }

    // Calculate progress
    const completedClips = compositeVideo.clips.filter(
      (c) => c.status === "completed"
    ).length;
    const totalClips = compositeVideo.totalClips;

    let progress = 0;
    if (compositeVideo.status === "completed") {
      progress = 100;
    } else if (compositeVideo.status === "stitching") {
      progress = 90;
    } else if (compositeVideo.status === "generating_clips") {
      progress = Math.round((completedClips / totalClips) * 80);
    }

    // Map clip progress
    const clips: ClipProgress[] = compositeVideo.clips.map((clip) => ({
      type: clip.clipType as "hook" | "testimonial" | "cta",
      index: clip.clipIndex,
      status: clip.status as ClipStatus,
      progress: clip.status === "completed" ? 100 : clip.status === "pending" ? 0 : 50,
      videoUrl: clip.videoUrl ?? undefined,
    }));

    const response: FalGenerateStatusResponse = {
      compositeVideoId: compositeVideo.id,
      status: compositeVideo.status as FalGenerateStatusResponse["status"],
      progress,
      currentClip: compositeVideo.currentClip,
      totalClips: compositeVideo.totalClips,
      clips,
      finalVideoUrl: compositeVideo.finalVideoUrl ?? undefined,
      thumbnailUrl: compositeVideo.thumbnailUrl ?? undefined,
      actualDuration: compositeVideo.actualDuration ?? undefined,
      error: compositeVideo.errorMessage ?? undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, "Failed to get FAL video status");
    return NextResponse.json(
      { error: "Failed to get video status" },
      { status: 500 }
    );
  }
}

/**
 * POST handler for processing clips (called by background job or webhook)
 * This is a simplified version - in production, use a proper job queue
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { compositeVideoId, action } = body;

    if (!compositeVideoId) {
      return NextResponse.json(
        { error: "Composite video ID is required" },
        { status: 400 }
      );
    }

    const compositeVideo = await prisma.falCompositeVideo.findUnique({
      where: { id: compositeVideoId },
      include: { clips: true, actor: true },
    });

    if (!compositeVideo) {
      return NextResponse.json(
        { error: "Composite video not found" },
        { status: 404 }
      );
    }

    // Handle different actions
    if (action === "process_next_clip") {
      // Find next pending clip
      const nextClip = compositeVideo.clips.find((c) => c.status === "pending");

      if (!nextClip) {
        // All clips done, trigger stitching
        await prisma.falCompositeVideo.update({
          where: { id: compositeVideoId },
          data: { status: "stitching" },
        });

        return NextResponse.json({ status: "stitching" });
      }

      // Update clip status
      await prisma.falClip.update({
        where: { id: nextClip.id },
        data: { status: "generating_audio" },
      });

      return NextResponse.json({
        status: "processing",
        clipId: nextClip.id,
        clipType: nextClip.clipType,
      });
    }

    if (action === "complete_clip") {
      const { clipId, videoUrl, audioUrl, duration } = body;

      await prisma.falClip.update({
        where: { id: clipId },
        data: {
          status: "completed",
          videoUrl,
          audioUrl,
          duration,
          completedAt: new Date(),
        },
      });

      // Update composite video current clip counter
      const completedCount = await prisma.falClip.count({
        where: { compositeVideoId, status: "completed" },
      });

      await prisma.falCompositeVideo.update({
        where: { id: compositeVideoId },
        data: { currentClip: completedCount },
      });

      return NextResponse.json({ status: "clip_completed" });
    }

    if (action === "complete_stitching") {
      const { finalVideoUrl, thumbnailUrl, actualDuration } = body;

      await prisma.falCompositeVideo.update({
        where: { id: compositeVideoId },
        data: {
          status: "completed",
          finalVideoUrl,
          thumbnailUrl,
          actualDuration,
          completedAt: new Date(),
        },
      });

      return NextResponse.json({ status: "completed" });
    }

    if (action === "fail") {
      const { error } = body;

      await prisma.falCompositeVideo.update({
        where: { id: compositeVideoId },
        data: {
          status: "failed",
          errorMessage: error,
        },
      });

      return NextResponse.json({ status: "failed" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    logger.error({ error }, "Failed to process FAL video action");
    return NextResponse.json(
      { error: "Failed to process action" },
      { status: 500 }
    );
  }
}

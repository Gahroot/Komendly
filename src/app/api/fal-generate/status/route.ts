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

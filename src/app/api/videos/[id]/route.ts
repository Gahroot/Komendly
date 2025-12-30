import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate session
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await validateSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Try to find in GeneratedVideo first, then FalCompositeVideo
    const [generatedVideo, falVideo] = await Promise.all([
      prisma.generatedVideo.findFirst({
        where: { id, userId: session.user.id },
        include: {
          review: {
            select: {
              reviewerName: true,
              businessName: true,
              reviewText: true,
              rating: true,
            },
          },
        },
      }),
      prisma.falCompositeVideo.findFirst({
        where: { id, userId: session.user.id },
        include: {
          review: {
            select: {
              reviewerName: true,
              businessName: true,
              reviewText: true,
              rating: true,
            },
          },
          actor: {
            select: { name: true, style: true },
          },
        },
      }),
    ]);

    if (generatedVideo) {
      const mappedVideo = {
        id: generatedVideo.id,
        reviewerName: generatedVideo.review.reviewerName,
        businessName: generatedVideo.review.businessName,
        reviewText: generatedVideo.review.reviewText,
        rating: generatedVideo.review.rating,
        thumbnailUrl: generatedVideo.thumbnailUrl || "",
        videoUrl: generatedVideo.url || "",
        aspectRatio: generatedVideo.aspectRatio as "9:16" | "16:9" | "1:1",
        style: generatedVideo.avatarStyle,
        duration: generatedVideo.duration || 0,
        createdAt: generatedVideo.createdAt.toISOString(),
      };
      return NextResponse.json({ video: mappedVideo });
    }

    if (falVideo) {
      const mappedVideo = {
        id: falVideo.id,
        reviewerName: falVideo.review.reviewerName,
        businessName: falVideo.review.businessName,
        reviewText: falVideo.review.reviewText,
        rating: falVideo.review.rating,
        thumbnailUrl: falVideo.thumbnailUrl || "",
        videoUrl: falVideo.finalVideoUrl || "",
        aspectRatio: falVideo.aspectRatio as "9:16" | "16:9" | "1:1",
        style: falVideo.actor?.name || falVideo.actor?.style || "AI Avatar",
        duration: falVideo.actualDuration || 0,
        createdAt: falVideo.createdAt.toISOString(),
      };
      return NextResponse.json({ video: mappedVideo });
    }

    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Failed to fetch video");

    return NextResponse.json(
      { error: "Failed to fetch video" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate session
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session_token")?.value;

    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await validateSession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    // Try to find in GeneratedVideo first, then FalCompositeVideo
    const [generatedVideo, falVideo] = await Promise.all([
      prisma.generatedVideo.findFirst({
        where: { id, userId: session.user.id },
      }),
      prisma.falCompositeVideo.findFirst({
        where: { id, userId: session.user.id },
      }),
    ]);

    if (generatedVideo) {
      await prisma.generatedVideo.delete({ where: { id } });
      logger.info({ videoId: id, userId: session.user.id, type: "generated" }, "Video deleted");
      return NextResponse.json({ success: true, message: "Video deleted successfully" });
    }

    if (falVideo) {
      await prisma.falCompositeVideo.delete({ where: { id } });
      logger.info({ videoId: id, userId: session.user.id, type: "fal" }, "Video deleted");
      return NextResponse.json({ success: true, message: "Video deleted successfully" });
    }

    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Failed to delete video");

    return NextResponse.json(
      { error: "Failed to delete video" },
      { status: 500 }
    );
  }
}

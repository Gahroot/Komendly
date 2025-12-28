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

    // Fetch video from database
    const video = await prisma.generatedVideo.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
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
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Map to expected format
    const mappedVideo = {
      id: video.id,
      reviewerName: video.review.reviewerName,
      businessName: video.review.businessName,
      reviewText: video.review.reviewText,
      rating: video.review.rating,
      thumbnailUrl: video.thumbnailUrl || "",
      videoUrl: video.url || "",
      aspectRatio: video.aspectRatio as "9:16" | "16:9" | "1:1",
      style: video.avatarStyle,
      duration: video.duration || 0,
      createdAt: video.createdAt.toISOString(),
    };

    return NextResponse.json({ video: mappedVideo });
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

    // Check if video exists and belongs to user
    const video = await prisma.generatedVideo.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    // Delete the video
    await prisma.generatedVideo.delete({
      where: { id },
    });

    logger.info({ videoId: id, userId: session.user.id }, "Video deleted");

    return NextResponse.json({
      success: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Failed to delete video");

    return NextResponse.json(
      { error: "Failed to delete video" },
      { status: 500 }
    );
  }
}

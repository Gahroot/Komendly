import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
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

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "12", 10);
    const search = searchParams.get("search") || "";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";

    // Build search filter
    const searchFilter = search
      ? {
          OR: [
            { review: { businessName: { contains: search, mode: "insensitive" as const } } },
            { review: { reviewerName: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {};

    // Fetch videos from database
    const videos = await prisma.generatedVideo.findMany({
      where: {
        userId: session.user.id,
        status: "completed",
        ...searchFilter,
      },
      orderBy: { createdAt: sortOrder },
      take: pageSize,
      skip: (page - 1) * pageSize,
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

    // Get total count for pagination
    const total = await prisma.generatedVideo.count({
      where: {
        userId: session.user.id,
        status: "completed",
        ...searchFilter,
      },
    });

    // Map to expected format
    const mappedVideos = videos.map((video) => ({
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
    }));

    return NextResponse.json({
      videos: mappedVideos,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Failed to fetch videos");

    return NextResponse.json(
      { error: "Failed to fetch videos" },
      { status: 500 }
    );
  }
}

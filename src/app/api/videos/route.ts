import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface MappedVideo {
  id: string;
  reviewerName: string;
  businessName: string;
  reviewText: string;
  rating: number;
  thumbnailUrl: string;
  videoUrl: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  style: string;
  duration: number;
  createdAt: string;
}

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

    // Build search filter for GeneratedVideo
    const generatedSearchFilter = search
      ? {
          OR: [
            { review: { businessName: { contains: search, mode: "insensitive" as const } } },
            { review: { reviewerName: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {};

    // Build search filter for FalCompositeVideo
    const falSearchFilter = search
      ? {
          OR: [
            { review: { businessName: { contains: search, mode: "insensitive" as const } } },
            { review: { reviewerName: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {};

    // Fetch both video types in parallel
    const [generatedVideos, falVideos, generatedCount, falCount] = await Promise.all([
      prisma.generatedVideo.findMany({
        where: {
          userId: session.user.id,
          status: "completed",
          ...generatedSearchFilter,
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
      }),
      prisma.falCompositeVideo.findMany({
        where: {
          userId: session.user.id,
          status: "completed",
          ...falSearchFilter,
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
          actor: {
            select: {
              name: true,
              style: true,
            },
          },
        },
      }),
      prisma.generatedVideo.count({
        where: {
          userId: session.user.id,
          status: "completed",
          ...generatedSearchFilter,
        },
      }),
      prisma.falCompositeVideo.count({
        where: {
          userId: session.user.id,
          status: "completed",
          ...falSearchFilter,
        },
      }),
    ]);

    // Map GeneratedVideo to common format
    const mappedGenerated: MappedVideo[] = generatedVideos.map((video) => ({
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

    // Map FalCompositeVideo to common format
    const mappedFal: MappedVideo[] = falVideos.map((video) => ({
      id: video.id,
      reviewerName: video.review.reviewerName,
      businessName: video.review.businessName,
      reviewText: video.review.reviewText,
      rating: video.review.rating,
      thumbnailUrl: video.thumbnailUrl || "",
      videoUrl: video.finalVideoUrl || "",
      aspectRatio: video.aspectRatio as "9:16" | "16:9" | "1:1",
      style: video.actor?.name || video.actor?.style || "AI Avatar",
      duration: video.actualDuration || 0,
      createdAt: video.createdAt.toISOString(),
    }));

    // Combine and sort all videos
    const allVideos = [...mappedGenerated, ...mappedFal].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });

    // Apply pagination to combined results
    const total = generatedCount + falCount;
    const paginatedVideos = allVideos.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      videos: paginatedVideos,
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

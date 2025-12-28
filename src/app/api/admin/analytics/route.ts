import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Fetch all stats in parallel
    const [
      totalVideos,
      completedVideos,
      failedVideos,
      videosByCreator,
      usersByPlan,
      usageStats,
      recentVideos,
    ] = await Promise.all([
      prisma.generatedVideo.count(),
      prisma.generatedVideo.count({ where: { status: "completed" } }),
      prisma.generatedVideo.count({ where: { status: "failed" } }),
      prisma.generatedVideo.groupBy({
        by: ["mirageCreatorName"],
        _count: { mirageCreatorName: true },
        where: { mirageCreatorName: { not: null } },
        orderBy: { _count: { mirageCreatorName: "desc" } },
        take: 10,
      }),
      prisma.user.groupBy({
        by: ["plan"],
        _count: { plan: true },
      }),
      prisma.user.aggregate({
        _sum: { minutesUsed: true },
        _avg: { minutesUsed: true },
      }),
      prisma.generatedVideo.findMany({
        where: {
          createdAt: { gte: twoWeeksAgo },
          completedAt: { not: null },
        },
        select: {
          createdAt: true,
          completedAt: true,
        },
      }),
    ]);

    // Calculate average generation time
    const completedWithTime = recentVideos.filter((v) => v.completedAt);
    const avgTime =
      completedWithTime.length > 0
        ? completedWithTime.reduce((acc, v) => {
            const diff =
              new Date(v.completedAt!).getTime() - new Date(v.createdAt).getTime();
            return acc + diff;
          }, 0) /
          completedWithTime.length /
          1000
        : 0;

    // Generate videos by day (last 14 days)
    const videosByDay = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const count = await prisma.generatedVideo.count({
        where: {
          createdAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });

      videosByDay.push({
        date: dayStart.toLocaleDateString("default", { month: "short", day: "numeric" }),
        count,
      });
    }

    return NextResponse.json({
      totalVideosGenerated: totalVideos,
      completedVideos,
      failedVideos,
      averageGenerationTime: avgTime,
      videosByDay,
      videosByCreator: videosByCreator.map((v) => ({
        creator: v.mirageCreatorName || "Unknown",
        count: v._count.mirageCreatorName,
      })),
      usersByPlan: usersByPlan.map((u) => ({
        plan: u.plan,
        count: u._count.plan,
      })),
      usageStats: {
        totalMinutesUsed: usageStats._sum.minutesUsed ?? 0,
        averageMinutesPerUser: usageStats._avg.minutesUsed ?? 0,
      },
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

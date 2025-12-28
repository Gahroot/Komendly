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

    // Get date ranges
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Fetch all stats in parallel
    const [
      totalUsers,
      activeSubscribers,
      totalVideos,
      usersThisMonth,
      usersLastMonth,
      videosThisMonth,
      videosLastMonth,
      recentUsers,
      recentVideos,
      videosByStatus,
      creditPurchases,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          subscriptionStatus: "active",
          plan: { notIn: ["pending", "free"] },
        },
      }),
      prisma.generatedVideo.count(),
      prisma.user.count({
        where: { createdAt: { gte: firstDayOfMonth } },
      }),
      prisma.user.count({
        where: {
          createdAt: {
            gte: firstDayOfLastMonth,
            lte: lastDayOfLastMonth,
          },
        },
      }),
      prisma.generatedVideo.count({
        where: { createdAt: { gte: firstDayOfMonth } },
      }),
      prisma.generatedVideo.count({
        where: {
          createdAt: {
            gte: firstDayOfLastMonth,
            lte: lastDayOfLastMonth,
          },
        },
      }),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          createdAt: true,
        },
      }),
      prisma.generatedVideo.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
      prisma.generatedVideo.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.creditPurchase.aggregate({
        _sum: { amountPaid: true },
      }),
    ]);

    // Calculate growth percentages
    const userGrowth = usersLastMonth > 0
      ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
      : usersThisMonth > 0 ? 100 : 0;

    const videoGrowth = videosLastMonth > 0
      ? Math.round(((videosThisMonth - videosLastMonth) / videosLastMonth) * 100)
      : videosThisMonth > 0 ? 100 : 0;

    // Generate monthly revenue data (last 6 months)
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const monthPurchases = await prisma.creditPurchase.aggregate({
        where: {
          createdAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        _sum: { amountPaid: true },
      });

      monthlyRevenue.push({
        month: monthStart.toLocaleString("default", { month: "short" }),
        revenue: (monthPurchases._sum.amountPaid ?? 0) / 100,
      });
    }

    return NextResponse.json({
      totalUsers,
      activeSubscribers,
      totalVideos,
      totalRevenue: creditPurchases._sum.amountPaid ?? 0,
      userGrowth,
      videoGrowth,
      recentUsers,
      recentVideos,
      monthlyRevenue,
      videosByStatus: videosByStatus.map((v) => ({
        status: v.status,
        count: v._count.status,
      })),
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

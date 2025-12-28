import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = 10;

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch all stats in parallel
    const [
      totalRevenue,
      monthlyRevenue,
      totalPurchases,
      recentPurchases,
    ] = await Promise.all([
      prisma.creditPurchase.aggregate({
        _sum: { amountPaid: true },
      }),
      prisma.creditPurchase.aggregate({
        where: { createdAt: { gte: firstDayOfMonth } },
        _sum: { amountPaid: true },
      }),
      prisma.creditPurchase.count(),
      prisma.creditPurchase.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      }),
    ]);

    // Generate monthly revenue data (last 6 months)
    const revenueByMonth = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

      const [monthRevenue, monthPurchases] = await Promise.all([
        prisma.creditPurchase.aggregate({
          where: {
            createdAt: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
          _sum: { amountPaid: true },
        }),
        prisma.creditPurchase.count({
          where: {
            createdAt: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
        }),
      ]);

      revenueByMonth.push({
        month: monthStart.toLocaleString("default", { month: "short" }),
        revenue: (monthRevenue._sum.amountPaid ?? 0) / 100,
        purchases: monthPurchases,
      });
    }

    // Revenue by plan (based on user's plan at time of purchase)
    const purchasesByPlan = await prisma.creditPurchase.groupBy({
      by: ["userId"],
      _sum: { amountPaid: true },
      _count: true,
    });

    const userPlans = await prisma.user.findMany({
      where: {
        id: { in: purchasesByPlan.map((p) => p.userId) },
      },
      select: { id: true, plan: true },
    });

    const planMap = new Map(userPlans.map((u) => [u.id, u.plan]));
    const revenueByPlanMap = new Map<string, { revenue: number; count: number }>();

    for (const purchase of purchasesByPlan) {
      const plan = planMap.get(purchase.userId) || "unknown";
      const existing = revenueByPlanMap.get(plan) || { revenue: 0, count: 0 };
      revenueByPlanMap.set(plan, {
        revenue: existing.revenue + (purchase._sum.amountPaid ?? 0) / 100,
        count: existing.count + purchase._count,
      });
    }

    const revenueByPlan = Array.from(revenueByPlanMap.entries()).map(([plan, data]) => ({
      plan,
      revenue: data.revenue,
      count: data.count,
    }));

    const total = totalRevenue._sum.amountPaid ?? 0;
    const averageOrderValue = totalPurchases > 0 ? total / totalPurchases : 0;

    return NextResponse.json({
      totalRevenue: total,
      monthlyRevenue: monthlyRevenue._sum.amountPaid ?? 0,
      averageOrderValue,
      totalPurchases,
      revenueByMonth,
      revenueByPlan,
      recentPurchases,
    });
  } catch (error) {
    console.error("Admin revenue error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

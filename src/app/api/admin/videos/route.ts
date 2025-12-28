import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VideoStatus } from "@prisma/client";

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
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");

    const where: {
      status?: VideoStatus;
      OR?: Array<{
        user?: { email?: { contains: string; mode: "insensitive" } };
        review?: { businessName?: { contains: string; mode: "insensitive" } };
      }>;
    } = {};

    if (status && status !== "all") {
      where.status = status as VideoStatus;
    }

    if (search) {
      where.OR = [
        { user: { email: { contains: search, mode: "insensitive" } } },
        { review: { businessName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [videos, total] = await Promise.all([
      prisma.generatedVideo.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          review: {
            select: {
              businessName: true,
              reviewerName: true,
            },
          },
        },
      }),
      prisma.generatedVideo.count({ where }),
    ]);

    return NextResponse.json({
      videos,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Admin videos error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

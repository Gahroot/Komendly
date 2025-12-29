/**
 * FAL Actors API
 * List available actors for lip-synced video generation
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { FalActorsResponse } from "@/lib/fal-lipsync/types";

export async function GET(request: Request) {
  try {
    // Authenticate user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params for filtering
    const url = new URL(request.url);
    const gender = url.searchParams.get("gender");
    const style = url.searchParams.get("style");

    // Build filter
    const where: Record<string, unknown> = {
      isActive: true,
    };

    if (gender && gender !== "all") {
      where.gender = gender;
    }

    if (style && style !== "all") {
      where.style = style;
    }

    // Fetch actors
    const actors = await prisma.falActor.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    const response: FalActorsResponse = {
      actors: actors.map((actor) => ({
        id: actor.id,
        name: actor.name,
        slug: actor.slug,
        gender: actor.gender as "male" | "female",
        style: actor.style,
        referenceImageUrl: actor.referenceImageUrl,
        thumbnailUrl: actor.thumbnailUrl,
        voiceId: actor.voiceId ?? undefined,
        description: actor.description ?? undefined,
        isActive: actor.isActive,
        sortOrder: actor.sortOrder,
      })),
      total: actors.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error({ error }, "Failed to fetch FAL actors");
    return NextResponse.json(
      { error: "Failed to fetch actors" },
      { status: 500 }
    );
  }
}

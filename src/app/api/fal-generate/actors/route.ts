/**
 * FAL Actors API
 * List available actors for lip-synced video generation
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import type { FalActorsResponse } from "@/lib/fal-lipsync/types";
import { getReadyRecommendation } from "@/lib/testimonial/recommend";
import { accentFromVoicePrompt } from "@/lib/testimonial/contracts";

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
    const reviewId = url.searchParams.get("reviewId");
    const picks = reviewId ? await getReadyRecommendation(user.id, reviewId) : null;
    const rank = new Map((picks ?? []).map((p, i) => [p.actorId, i + 1]));

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
        voiceProvider: actor.voiceProvider ?? undefined,
        accent: accentFromVoicePrompt(actor.voicePrompt) ?? undefined,
        ageRange: actor.ageRange ?? undefined,
        persona: actor.persona ?? undefined,
        occupation: actor.occupation ?? undefined,
        setting: actor.setting ?? undefined,
        tags: actor.tags,
        industries: actor.industries,
        ...(picks ? { recommended: rank.has(actor.id), recommendRank: rank.get(actor.id) } : {}),
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

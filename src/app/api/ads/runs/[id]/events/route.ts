import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "@/lib/ads/events";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

// Client-reported funnel events (allowlisted, once per run).
const BodySchema = z.object({ name: z.enum(["extraction_shown"]) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, workspace } = await requireWorkspaceMember({ runId: id });
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Unknown event.");
    const extractAttempt = await prisma.adJob.count({ where: { runId: id, type: "extract" } });
    const seen = await prisma.adsEvent.count({ where: { runId: id, name: parsed.data.name } });
    if (seen < extractAttempt) {
      await trackAdsEvent(parsed.data.name, { workspaceId: workspace.id, userId: user.id, runId: id, props: { attempt: extractAttempt } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

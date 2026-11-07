import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { retryExtraction } from "@/lib/ads/run-confirm";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

const BodySchema = z.object({ note: z.string().trim().max(1000).optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireWorkspaceMember({ runId: id });
    const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Keep the note under 1,000 characters.");
    const run = await prisma.adRun.findUniqueOrThrow({ where: { id } });
    await retryExtraction(run, { userId: user.id, note: parsed.data.note || undefined });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

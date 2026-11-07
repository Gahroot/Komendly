import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CorrectionsSchema } from "@/lib/ads/contracts";
import { fingerprintFrom } from "@/lib/ads/run";
import { confirmRun } from "@/lib/ads/run-confirm";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

const BodySchema = z.object({ corrections: CorrectionsSchema.default({}), auto: z.boolean().optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, workspace } = await requireWorkspaceMember({ runId: id });
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Some of your edits aren't valid. Check the landing page URL and lengths.");
    const run = await prisma.adRun.findUniqueOrThrow({ where: { id } });
    await confirmRun(run, { user, workspace, fp: fingerprintFrom(request), corrections: parsed.data.corrections, auto: parsed.data.auto ?? false });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

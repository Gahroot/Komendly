import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseExtraction } from "@/lib/ads/run-confirm";
import { presignGet } from "@/lib/ads/storage";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireWorkspaceMember({ runId: id });
    const run = await prisma.adRun.findUniqueOrThrow({ where: { id }, include: { brandProfile: { select: { logoKey: true } } } });
    const key = parseExtraction(run.extraction)?.logoKey ?? run.brandProfile?.logoKey;
    if (!key) throw new AdsHttpError(404, "not_found", "No logo.");
    return NextResponse.redirect(await presignGet(key, { seconds: 600 }), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

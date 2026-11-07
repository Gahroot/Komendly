import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { presignGet } from "@/lib/ads/storage";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { workspace } = await requireWorkspaceMember({ brandProfileId: id });
    const brand = await prisma.brandProfile.findFirstOrThrow({ where: { id, workspaceId: workspace.id }, select: { logoKey: true } });
    if (!brand.logoKey) throw new AdsHttpError(404, "not_found", "No logo.");
    return NextResponse.redirect(await presignGet(brand.logoKey, { seconds: 600 }), { status: 302, headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

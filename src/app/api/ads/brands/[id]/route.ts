import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { brandUpdateData, BrandUpdateSchema } from "@/lib/ads/brand";
import { brandDetail } from "@/lib/ads/brand-view";
import { adsErrorResponse, AdsHttpError, requireWorkspaceMember } from "@/lib/ads/workspace";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { workspace } = await requireWorkspaceMember({ brandProfileId: id });
    const brand = await prisma.brandProfile.findFirstOrThrow({ where: { id, workspaceId: workspace.id } });
    return NextResponse.json(brandDetail(brand));
  } catch (error) {
    return adsErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { workspace } = await requireWorkspaceMember({ brandProfileId: id });
    const parsed = BrandUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Check the highlighted fields (colours must be hex like #1A2B3C).");
    const brand = await prisma.brandProfile.findFirstOrThrow({ where: { id, workspaceId: workspace.id } });
    const updated = await prisma.brandProfile.update({ where: { id }, data: brandUpdateData(brand, parsed.data, new Date()) });
    return NextResponse.json(brandDetail(updated));
  } catch (error) {
    return adsErrorResponse(error);
  }
}

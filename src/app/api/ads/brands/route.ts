import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { brandSummary } from "@/lib/ads/brand-view";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

export async function GET() {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    const brands = await prisma.brandProfile.findMany({ where: { workspaceId: workspace.id }, orderBy: { updatedAt: "desc" } });
    return NextResponse.json({ brands: brands.map(brandSummary) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

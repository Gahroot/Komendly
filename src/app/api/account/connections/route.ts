// Connected apps (OAuth grants to the hosted Ozzy MCP server). Cookie session only.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse } from "@/lib/ads/workspace";
import { requireCookieUser } from "@/lib/agent-keys/manage";
import { grantView } from "@/lib/oauth/store";

export async function GET() {
  try {
    const user = await requireCookieUser();
    const grants = await prisma.oAuthGrant.findMany({ where: { userId: user.id, revokedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ connections: grants.map(grantView) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

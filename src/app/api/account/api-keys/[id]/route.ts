import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdsHttpError, adsErrorResponse } from "@/lib/ads/workspace";
import { apiKeyView, requireCookieUser } from "@/lib/agent-keys/manage";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCookieUser();
    const { id } = await params;
    const key = await prisma.agentApiKey.findFirst({ where: { id, userId: user.id } });
    if (!key) throw new AdsHttpError(404, "not_found", "Not found.");
    const updated = key.revokedAt ? key : await prisma.agentApiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    return NextResponse.json({ key: apiKeyView(updated) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

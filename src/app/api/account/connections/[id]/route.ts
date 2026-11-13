import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AdsHttpError, adsErrorResponse } from "@/lib/ads/workspace";
import { requireCookieUser } from "@/lib/agent-keys/manage";
import { revokeGrant } from "@/lib/oauth/store";

/** Disconnect: revokes the grant and every token issued under it. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCookieUser();
    const { id } = await params;
    const grant = await prisma.oAuthGrant.findFirst({ where: { id, userId: user.id } });
    if (!grant) throw new AdsHttpError(404, "not_found", "Not found.");
    await revokeGrant(grant.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createApproveLink } from "@/lib/growth/creative-hubs-server";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse, requireUser } from "@/lib/ads/workspace";

export const dynamic = "force-dynamic";

/** Signed-in owner: { runId } -> { url } a no-login /approve/<token> link (60 days) where clients approve or ask for changes. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const b = (await request.json().catch(() => ({}))) as { runId?: unknown };
    const url = typeof b.runId === "string" ? await createApproveLink(user.id, b.runId, request.nextUrl.origin) : null;
    if (url && typeof b.runId === "string") {
      // Lets the agency dashboard show "waiting for client" (links are stateless, so record that one was made). Never blocks the link.
      const run = await prisma.adRun.findUnique({ where: { id: b.runId }, select: { workspaceId: true } }).catch(() => null);
      if (run) await prisma.adsEvent.create({ data: { name: "approve_link_created", workspaceId: run.workspaceId, userId: user.id, runId: b.runId, props: {} } }).catch(() => undefined);
    }
    return url ? NextResponse.json({ url }) : NextResponse.json({ error: "Run not found." }, { status: 404 });
  } catch (e) { return adsErrorResponse(e); }
}

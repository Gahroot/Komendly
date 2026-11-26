import { NextRequest, NextResponse } from "next/server";
import { createApproveLink } from "@/lib/growth/creative-hubs-server";
import { adsErrorResponse, requireUser } from "@/lib/ads/workspace";

export const dynamic = "force-dynamic";

/** Signed-in owner: { runId } -> { url } a no-login /approve/<token> link (60 days) where clients approve or ask for changes. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const b = (await request.json().catch(() => ({}))) as { runId?: unknown };
    const url = typeof b.runId === "string" ? await createApproveLink(user.id, b.runId, request.nextUrl.origin) : null;
    return url ? NextResponse.json({ url }) : NextResponse.json({ error: "Run not found." }, { status: 404 });
  } catch (e) { return adsErrorResponse(e); }
}

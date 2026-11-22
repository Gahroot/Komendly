import { NextResponse } from "next/server";
import { changeTeam, loadTeamStatus, requireTeamAccess } from "@/lib/ads/team/server";
import { adsErrorResponse } from "@/lib/ads/workspace";

export const dynamic = "force-dynamic";

/** Team page data: mandate, Meta connection + readiness, measured/estimated numbers, roster, activity feed, leads. */
export async function GET() {
  try {
    return NextResponse.json(await loadTeamStatus(await requireTeamAccess()), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

/** { action: "pause" } | { action: "resume" | "update", agreed: true, monthlyLimit?, zips?, leadEmail?, privacyUrl? } */
export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const isPause = (body as { action?: unknown } | null)?.action === "pause";
    // Pausing is safe from anywhere; turning spend back on or changing the limit is an authorization: humans only.
    const access = await requireTeamAccess({ human: !isPause });
    return NextResponse.json({ ok: true, mandate: await changeTeam(access, body) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

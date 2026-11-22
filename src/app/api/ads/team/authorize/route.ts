import { NextResponse } from "next/server";
import { authorizeTeam, requireTeamAccess } from "@/lib/ads/team/server";
import { adsErrorResponse } from "@/lib/ads/workspace";

/** The owner hires the team: spend authorization, signed in on komendly.com only (API keys refused in middleware too). */
export async function POST(request: Request) {
  try {
    const access = await requireTeamAccess({ human: true });
    const body: unknown = await request.json().catch(() => null);
    return NextResponse.json({ ok: true, mandate: await authorizeTeam(access, body) });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { parseAutopilotPatch } from "@/lib/ads/autopilot";
import { loadAutopilot, saveAutopilot } from "@/lib/ads/autopilot-server";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

/** Ozzy Autopilot settings + latest drop for the signed-in user's workspace. */
export async function GET() {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    return NextResponse.json(await loadAutopilot(ws), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

/** Body: { enabled?, focus?, includeVideo? } */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const parsed = parseAutopilotPatch(await request.json().catch(() => null));
    if (!parsed.ok) throw new AdsHttpError(400, "invalid_input", parsed.error);
    const r = await saveAutopilot(ws, parsed.patch, user.id);
    if (!r.ok) return NextResponse.json({ error: r.message, code: r.code, upgradeUrl: "/pricing?utm_source=autopilot" }, { status: 403 });
    return NextResponse.json(r.view);
  } catch (error) {
    return adsErrorResponse(error);
  }
}

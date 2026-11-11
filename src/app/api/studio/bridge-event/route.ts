// Exposure event for the ads -> Studio bridge (AdsEvent studio_bridge_shown {placement}); only when the flag is on.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackAdsEvent } from "@/lib/ads/events";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import { BRIDGE_PLACEMENTS } from "@/lib/studio/bridge";
import { studioBridgeEnabled } from "@/lib/studio/bridge-server";

const Body = z.object({ placement: z.enum(BRIDGE_PLACEMENTS), runId: z.string().max(64).optional() });

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
    if (!(await studioBridgeEnabled())) return NextResponse.json({ ok: false });
    const ws = await getOrCreateWorkspace(user);
    await trackAdsEvent("studio_bridge_shown", { workspaceId: ws.id, userId: user.id, props: { placement: parsed.data.placement } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

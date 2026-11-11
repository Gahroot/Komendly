// Post-trial offer: GET = Launch Quarter eligibility for the signed-in workspace; POST = record a shown/declined step.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackAdsEvent } from "@/lib/ads/events";
import { getLaunchOfferState } from "@/lib/ads/launch-offer";
import { priceIdFor, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { adsErrorResponse, getOrCreateWorkspace, isPaidWorkspace, requireUser } from "@/lib/ads/workspace";

export async function GET() {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const state = await getLaunchOfferState(ws.id);
    const eligible = !isPaidWorkspace(ws) && !ws.suspendedAt;
    // serverNow lets the client run a real countdown against server time (expiresAt = 3rd ready trial ad + 72h).
    // unlockPack = the $9 downsell can be bought (the run screen shows it only after the Launch Quarter).
    return NextResponse.json(
      { open: eligible && state.open, expiresAt: state.expiresAt?.toISOString() ?? null, serverNow: new Date().toISOString(), unlockPack: eligible && Boolean(priceIdFor(UNLOCK_PACK)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adsErrorResponse(error);
  }
}

const Body = z.object({
  name: z.enum(["upsell_shown", "upsell_declined", "downsell_shown", "offer_nudge_shown", "offer_modal_shown", "offer_dismissed", "offer_clicked", "locked_bonus_shown"]),
  props: z.record(z.string(), z.union([z.string().max(80), z.number(), z.boolean()])).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
    const ws = await getOrCreateWorkspace(user);
    const props = parsed.data.props ?? {};
    const runId = typeof props.runId === "string" ? props.runId : undefined;
    await trackAdsEvent(parsed.data.name, { workspaceId: ws.id, userId: user.id, ...(runId ? { runId } : {}), props });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

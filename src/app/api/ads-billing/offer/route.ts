// Post-trial offer: GET = Launch Quarter eligibility for the signed-in workspace; POST = record a shown/declined step.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackAdsEvent } from "@/lib/ads/events";
import { getAutopilotLaunchState } from "@/lib/ads/autopilot-launch";
import { getLaunchOfferState } from "@/lib/ads/launch-offer";
import { AUTOPILOT_LAUNCH, getPlan, offerCouponId, priceIdFor, UNLOCK_PACK } from "@/lib/ads/billing-config";
import { AUTOPILOT_PLAN_KEY, autopilotForSale, usesAutopilotOffer } from "@/lib/ads/roofer-offer";
import { workspaceTrade } from "@/lib/ads/trade-server";
import { foundingSpotsLeft } from "@/lib/ads/founding-spots";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse, getOrCreateWorkspace, isPaidWorkspace, requireUser } from "@/lib/ads/workspace";

export async function GET() {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const state = await getLaunchOfferState(ws.id);
    const eligible = !isPaidWorkspace(ws) && !ws.suspendedAt;
    // Trade workspaces (roofers) lead with Growth Autopilot when it can be bought (src/lib/ads/roofer-offer.ts).
    const trade = await workspaceTrade(ws.id);
    const autopilotPlan = getPlan(AUTOPILOT_PLAN_KEY);
    const sellable = eligible && usesAutopilotOffer(trade) && autopilotForSale() && Boolean(autopilotPlan && priceIdFor(autopilotPlan));
    const spotsLeft = sellable ? await foundingSpotsLeft(prisma).catch(() => null) : null;
    const autopilot = sellable && spotsLeft !== 0;
    // Growth Autopilot first month ($97): finished free pack, 7 days, once, founding spot free, price + coupon configured.
    const launchState = eligible ? await getAutopilotLaunchState(ws.id) : null;
    const launchConfigured = Boolean(priceIdFor(AUTOPILOT_LAUNCH) && offerCouponId(AUTOPILOT_LAUNCH));
    const launchSpots = launchState?.open && launchConfigured ? await foundingSpotsLeft(prisma).catch(() => null) : null;
    const autopilotLaunch = Boolean(launchState?.open && launchConfigured && launchSpots !== 0);
    // serverNow lets the client run a real countdown against server time (expiresAt = 3rd ready trial ad + 72h).
    // unlockPack = the $9 downsell can be bought (the run screen shows it only after the Launch Quarter).
    return NextResponse.json(
      { open: eligible && state.open, expiresAt: state.expiresAt?.toISOString() ?? null, serverNow: new Date().toISOString(), unlockPack: eligible && Boolean(priceIdFor(UNLOCK_PACK)), trade, autopilot, spotsLeft, autopilotLaunch, autopilotLaunchExpiresAt: autopilotLaunch ? launchState?.expiresAt?.toISOString() ?? null : null, autopilotLaunchSpotsLeft: launchSpots },
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
    const trade = await workspaceTrade(ws.id);
    const props: Record<string, string | number | boolean> = { ...(parsed.data.props ?? {}), ...(trade ? { trade } : {}) };
    const runId = typeof props.runId === "string" ? props.runId : undefined;
    await trackAdsEvent(parsed.data.name, { workspaceId: ws.id, userId: user.id, ...(runId ? { runId } : {}), props });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

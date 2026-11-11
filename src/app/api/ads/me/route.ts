import { NextResponse } from "next/server";
import { getBalance } from "@/lib/ads/credits";
import { TRIAL_GRANT } from "@/lib/ads/contracts";
import { expiringCredits, trialStaticCountFor } from "@/lib/ads/referrals";
import type { WorkspaceView } from "@/lib/ads/run-types";
import { adsErrorResponse, getOrCreateWorkspace, isPaidWorkspace, requireUser } from "@/lib/ads/workspace";

export async function GET() {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const isPaid = isPaidWorkspace(ws);
    const balance = await getBalance(ws.id);
    const view: WorkspaceView = {
      id: ws.id,
      name: ws.name,
      plan: ws.adsPlan,
      isPaid,
      trialAvailable: !isPaid && !ws.trialUsedAt,
      balance,
      emailVerified: Boolean(user.emailVerifiedAt),
      email: user.email,
      trialStatic: await trialStaticCountFor(ws.id, Number(process.env.ADS_TRIAL_STATIC_COUNT) || TRIAL_GRANT.static),
      expiring: await expiringCredits(ws.id, balance),
    };
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

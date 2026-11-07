import { NextResponse } from "next/server";
import { getBalance } from "@/lib/ads/credits";
import type { WorkspaceView } from "@/lib/ads/run-types";
import { adsErrorResponse, getOrCreateWorkspace, isPaidWorkspace, requireUser } from "@/lib/ads/workspace";

export async function GET() {
  try {
    const user = await requireUser();
    const ws = await getOrCreateWorkspace(user);
    const isPaid = isPaidWorkspace(ws);
    const view: WorkspaceView = {
      id: ws.id,
      name: ws.name,
      plan: ws.adsPlan,
      isPaid,
      trialAvailable: !isPaid && !ws.trialUsedAt,
      balance: await getBalance(ws.id),
      emailVerified: Boolean(user.emailVerifiedAt),
      email: user.email,
    };
    return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

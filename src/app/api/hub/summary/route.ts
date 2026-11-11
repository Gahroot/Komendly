import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { loadHubSummary } from "@/lib/hub/load-summary";

export const dynamic = "force-dynamic";

/** The signed-in user's hub: wallet, plan card, per-app counts and recent items across all apps. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ws = await getOrCreateWorkspace(user);
  const summary = await loadHubSummary(user, ws, new Date());
  return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
}

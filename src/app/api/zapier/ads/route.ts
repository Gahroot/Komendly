// Zapier "Ads ready" polling trigger: the workspace's newest ready ads (each with 7-day image links), newest first.
// Zapier dedupes by `id` (the ad id). Auth: `Bearer kmd_...` (or the web session). ?limit=1-100 (default 50), ?run_id=.
import { NextResponse } from "next/server";
import { adsErrorResponse } from "@/lib/ads/workspace";
import { originOf } from "@/lib/oauth/core";
import { zapierReadyAds } from "@/lib/zapier/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const n = Number(q.get("limit") ?? 50);
    const limit = Number.isInteger(n) ? Math.min(100, Math.max(1, n)) : 50;
    const runId = q.get("run_id")?.trim().slice(0, 64) || undefined;
    const ads = await zapierReadyAds(originOf(request), { limit, ...(runId ? { runId } : {}) });
    return NextResponse.json({ ads }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

// Zapier "Find ad run": one Ad Pack with its ads and 7-day image links. Auth: `Bearer kmd_...` (or the web session).
import { NextResponse } from "next/server";
import { adsErrorResponse } from "@/lib/ads/workspace";
import { originOf } from "@/lib/oauth/core";
import { zapierRunFor } from "@/lib/zapier/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await zapierRunFor(id, originOf(request)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

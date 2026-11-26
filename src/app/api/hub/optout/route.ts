import { NextRequest, NextResponse } from "next/server";
import { applyOptOut } from "@/lib/growth/creative-hubs-server";

export const dynamic = "force-dynamic";

/** Signed opt-out from the nominee email (link click = GET, mail-client one-click = POST). Never contacts that address again. */
async function handle(request: NextRequest) {
  const ok = await applyOptOut(request.nextUrl.searchParams.get("t") ?? "");
  return ok ? NextResponse.redirect(new URL("/nominate?optout=1", request.nextUrl.origin), 303) : NextResponse.json({ error: "Invalid link" }, { status: 400 });
}
export const GET = handle;
export const POST = handle;

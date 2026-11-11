import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { loadSourceFunnel, parseFunnelQuery } from "@/lib/ads/funnel-queries";

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&by=channel|source|campaign|content */
export async function GET(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  const sp = request.nextUrl.searchParams;
  const q = parseFunnelQuery({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, by: sp.get("by") ?? undefined });
  return NextResponse.json(await loadSourceFunnel(q.from, q.to, q.by));
}

import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { loadAdsOverview } from "@/lib/ads/metrics-queries";

export async function GET() {
  const admin = await checkAdmin();
  if (!admin.ok) return admin.response;
  return NextResponse.json(await loadAdsOverview());
}

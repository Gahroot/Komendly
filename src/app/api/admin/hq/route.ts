import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/ads/billing-auth";
import { loadHq } from "@/lib/hub/hq-queries";

export const dynamic = "force-dynamic";

/** Ozzy HQ: one owner overview across Ad Packs, Studio and Testimonials. */
export async function GET() {
  const auth = await checkAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await loadHq(new Date()));
}

// Ad of the week consent for the signed-in user's own ads.
import { NextRequest, NextResponse } from "next/server";
import { consentFeature, loadRunFeatures, withdrawFeature } from "@/lib/ads/feature-actions";
import { FeatureConsent } from "@/lib/ads/features";
import { adsErrorResponse, AdsHttpError } from "@/lib/ads/workspace";

export async function GET(request: NextRequest) {
  try {
    const runId = request.nextUrl.searchParams.get("runId");
    if (!runId) throw new AdsHttpError(400, "bad_request", "runId required");
    return NextResponse.json(await loadRunFeatures(runId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = FeatureConsent.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "bad_request", parsed.error.issues[0]?.message ?? "Invalid request");
    return NextResponse.json(await consentFeature(parsed.data));
  } catch (error) {
    return adsErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adId = request.nextUrl.searchParams.get("adId");
    if (!adId) throw new AdsHttpError(400, "bad_request", "adId required");
    return NextResponse.json(await withdrawFeature(adId));
  } catch (error) {
    return adsErrorResponse(error);
  }
}

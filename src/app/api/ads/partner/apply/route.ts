import { NextRequest, NextResponse } from "next/server";
import { PartnerApplication } from "@/lib/ads/partner";
import { applyAsPartner } from "@/lib/ads/partner-admin";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = PartnerApplication.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "bad_request", parsed.error.issues[0]?.message ?? "Please check the form.");
    const workspace = await getOrCreateWorkspace(user);
    const result = await applyAsPartner(user, workspace, parsed.data);
    if (!result.ok) throw new AdsHttpError(409, "already_applied", result.error);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

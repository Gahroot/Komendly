import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fingerprintFrom } from "@/lib/ads/run";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import { agencyEnabled, bulkDrop, isAgencyWorkspace } from "@/lib/customer-intel/agency-server";

export const dynamic = "force-dynamic";
const Body = z.object({ brandIds: z.array(z.string().max(64)).min(1).max(10) });

/** Agency plan only: start this week's drop for the selected client brands (idempotent per brand per week; credits checked server-side). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const workspace = await getOrCreateWorkspace(user);
    if (!(await agencyEnabled()) || !isAgencyWorkspace(workspace)) throw new AdsHttpError(404, "not_found", "Not found.");
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Choose between 1 and 10 clients.");
    return NextResponse.json(await bulkDrop({ user, workspace, brandIds: parsed.data.brandIds, fp: fingerprintFrom(request) }));
  } catch (error) {
    return adsErrorResponse(error);
  }
}

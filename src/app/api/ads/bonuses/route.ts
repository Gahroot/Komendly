import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fingerprintFrom } from "@/lib/ads/run";
import { rerunCheckup, startHookRun } from "@/lib/ads/bonuses/server";
import { adsErrorResponse, AdsHttpError, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rerun_checkup") }),
  z.object({ action: z.literal("hook_run"), hook: z.string().trim().min(1).max(300) }),
]);

/** Ozzy Ad Department bonus actions: re-run the website check-up, or make an ad from a library hook. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Something went wrong. Refresh the page and try again.");
    const workspace = await getOrCreateWorkspace(user);
    if (parsed.data.action === "rerun_checkup") return NextResponse.json(await rerunCheckup(workspace));
    return NextResponse.json(await startHookRun(parsed.data.hook, { user, workspace, fp: fingerprintFrom(request) }), { status: 201 });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

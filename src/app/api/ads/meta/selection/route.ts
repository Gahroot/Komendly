import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMetaAccess } from "@/lib/ads/meta/access";
import { saveMetaSelection } from "@/lib/ads/meta/connection";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ adAccountId: z.string().regex(/^(act_)?\d+$/), pageId: z.string().regex(/^\d+$/) });

export async function POST(request: Request) {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    await requireMetaAccess(workspace);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Pick an ad account and a page.");
    await saveMetaSelection(workspace.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

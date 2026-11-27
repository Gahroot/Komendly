import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/ads/abuse";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { authFor, googleHttpError, requireGoogleConnection } from "@/lib/ads/google/connection";
import { suggestGeo } from "@/lib/ads/google/core/ops";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ q: z.string().max(100) });

export async function POST(request: Request) {
  try {
    const workspace = await getOrCreateWorkspace(await requireUser());
    await requireGoogleAccess(workspace);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Type a city or area.");
    const q = parsed.data.q.trim();
    if (q.length < 2) return NextResponse.json({ results: [] });
    if (!(await rateLimit(`google_geo:${workspace.id}`, 300, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many searches. Please wait a minute.");
    const conn = await requireGoogleConnection(workspace.id);
    try {
      return NextResponse.json({ results: await suggestGeo(authFor(conn), q) });
    } catch (e) {
      throw googleHttpError(e, "We couldn't search places right now.");
    }
  } catch (error) {
    return adsErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/ads/abuse";
import { requireGoogleAccess } from "@/lib/ads/google/access";
import { googleOAuthConfig } from "@/lib/ads/google/config";
import { startGoogleConnect } from "@/lib/ads/google/oauth-flow";
import { AdsHttpError, adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ returnTo: z.string().max(500) });

/** Starts "Sign in with Google"; the dialog sends the browser to the returned url. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const workspace = await getOrCreateWorkspace(user);
    await requireGoogleAccess(workspace);
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid", "Please try again.");
    if (!(await rateLimit(`google_connect:${workspace.id}`, 20, 3600))) throw new AdsHttpError(429, "rate_limited", "Too many tries. Please wait a few minutes.");
    const url = await startGoogleConnect({ config: googleOAuthConfig(), workspaceId: workspace.id, userId: user.id, returnTo: parsed.data.returnTo });
    return NextResponse.json({ url });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

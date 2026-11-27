import { NextResponse } from "next/server";
import { googleOAuthConfig } from "@/lib/ads/google/config";
import { finishGoogleConnect, returnUrl } from "@/lib/ads/google/oauth-flow";
import { AdsHttpError, requireUser } from "@/lib/ads/workspace";

/** Google sends the signed-in browser back here; we go back to the page they came from with ?google=connected|error. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (path: string) => NextResponse.redirect(new URL(path, url.origin), { headers: { "cache-control": "no-store" } });
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  if (!code || !state) return back(returnUrl("/ads/app", "error", denied === "access_denied" ? "access_denied" : "cancelled"));
  try {
    const user = await requireUser();
    const { returnTo } = await finishGoogleConnect({ config: googleOAuthConfig(), state, code, userId: user.id });
    return back(returnUrl(returnTo, "connected"));
  } catch (error) {
    if (!(error instanceof AdsHttpError)) console.error("[ads/google] callback failed", error);
    const returnTo = error instanceof AdsHttpError && typeof error.extra.returnTo === "string" ? error.extra.returnTo : "/ads/app";
    return back(returnUrl(returnTo, "error", error instanceof AdsHttpError ? error.code : "failed"));
  }
}

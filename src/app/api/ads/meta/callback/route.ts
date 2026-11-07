import { NextResponse } from "next/server";
import { metaAppConfig } from "@/lib/ads/meta/config";
import { finishMetaConnect } from "@/lib/ads/meta/oauth-flow";
import { AdsHttpError, requireUser } from "@/lib/ads/workspace";

// Opened in a popup by the publish dialog: notify the opener and close; plain link otherwise.
function page(ok: boolean, message: string) {
  const payload = JSON.stringify({ type: "komendly:meta", ok });
  const html = `<!doctype html><meta charset="utf-8"><title>Meta</title><body style="font-family:system-ui;padding:2rem">
<p>${message}</p><p><a href="/ads/app">Back to Komendly</a></p>
<script>try{window.opener&&window.opener.postMessage(${payload},location.origin);window.opener&&window.close()}catch(e){}</script></body>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return page(false, "Meta sign-in was cancelled.");
  try {
    const user = await requireUser();
    await finishMetaConnect({ config: metaAppConfig(), state, code, userId: user.id });
    return page(true, "Meta account connected. You can close this window.");
  } catch (error) {
    if (!(error instanceof AdsHttpError)) console.error("[ads/meta] callback failed", error);
    return page(false, error instanceof AdsHttpError ? error.message : "Meta sign-in failed. Please try again.");
  }
}

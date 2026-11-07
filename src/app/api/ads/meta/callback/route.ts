import { NextResponse } from "next/server";
import { metaAppConfig } from "@/lib/ads/meta/config";
import { finishMetaConnect } from "@/lib/ads/meta/oauth-flow";
import { AdsHttpError, requireUser } from "@/lib/ads/workspace";

// Opened in a popup by the publish dialog: notify the opener and close; plain link otherwise.
function page(ok: boolean, message: string) {
  const payload = JSON.stringify({ type: "komendly:meta", ok });
  const ozzy = ok ? "/brand/ozzy-joyful-happy.png" : "/brand/ozzy-classic-confused.png";
  const safe = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Meta · Komendly</title>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,sans-serif;color:#fff1d6;background:linear-gradient(180deg,#0b0720 0%,#1f1040 70%,#3a1428 100%)">
<main style="max-width:380px;margin:24px;text-align:center">
<img src="${ozzy}" width="112" height="112" alt="" style="image-rendering:pixelated;display:block;margin:0 auto -14px;position:relative">
<div style="background:rgba(40,22,80,.72);border:1px solid rgba(255,225,170,.14);border-radius:24px;padding:32px 24px 26px">
<p style="font-family:Georgia,serif;font-size:22px;line-height:1.3;margin:0 0 18px">${safe}</p>
<a href="/ads/app" style="display:inline-block;background:#ffcf4a;color:#2a0f10;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:14px;box-shadow:inset 0 -2px 0 #c98a1a">Back to Komendly</a>
</div></main>
<script>try{window.opener&&window.opener.postMessage(${payload},location.origin);window.opener&&window.close()}catch(e){}</script></body></html>`;
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

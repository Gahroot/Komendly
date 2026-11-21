// Tiny noindex HTML page for the ad watch confirm/unsubscribe links (same look as /api/ads/email-unsubscribe).
import { NextResponse } from "next/server";
import { escapeHtml } from "@/lib/email/layout";

export function adWatchPage(title: string, body: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,sans-serif;color:#fff1d6;background:#0c0820"><div style="max-width:440px;padding:32px 24px;text-align:center">${body}</div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}

export const adWatchButton = (action: string, label: string) =>
  `<form method="post" action="${escapeHtml(action)}"><button type="submit" style="margin-top:16px;padding:12px 24px;border:0;border-radius:12px;background:#ffcf4a;color:#2a0f10;font-weight:700;font-size:16px">${escapeHtml(label)}</button></form>`;

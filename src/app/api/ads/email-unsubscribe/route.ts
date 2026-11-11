import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEmailToken } from "@/lib/ads/lifecycle/tokens";
import { escapeHtml } from "@/lib/email/layout";

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,sans-serif;color:#fff1d6;background:#0c0820"><div style="max-width:420px;padding:32px 24px;text-align:center">${body}</div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function userIdFrom(request: NextRequest): string | null {
  const p = verifyEmailToken(request.nextUrl.searchParams.get("t") ?? "", process.env.LIFECYCLE_EMAIL_SECRET ?? "");
  return p?.p === "unsub" ? p.u : null;
}

/** GET shows a confirm button (link scanners must not unsubscribe people); POST unsubscribes (RFC 8058 one-click too). */
export async function GET(request: NextRequest) {
  if (!userIdFrom(request)) return page("Link not valid", "<h1>That link didn't work</h1><p>Reply to any of our emails and we'll take you off the list.</p>", 400);
  const action = escapeHtml(request.nextUrl.pathname + request.nextUrl.search);
  return page(
    "Unsubscribe",
    `<h1>Stop Komendly emails?</h1><p>You'll stop getting reminder and tips emails. Account emails (like sign-in codes you ask for) still arrive.</p><form method="post" action="${action}"><button type="submit" style="margin-top:16px;padding:12px 24px;border:0;border-radius:12px;background:#ffcf4a;color:#2a0f10;font-weight:700;font-size:16px">Unsubscribe</button></form>`,
  );
}

export async function POST(request: NextRequest) {
  const userId = userIdFrom(request);
  if (!userId) return page("Link not valid", "<h1>That link didn't work</h1>", 400);
  const already = await prisma.adsEvent.findFirst({ where: { name: "email_unsubscribed", userId }, select: { id: true } });
  if (!already) await prisma.adsEvent.create({ data: { name: "email_unsubscribed", userId, props: { via: "link" } } });
  return page("Unsubscribed", "<h1>You're unsubscribed</h1><p>No more reminder emails from Komendly. Sorry to see you go.</p>");
}

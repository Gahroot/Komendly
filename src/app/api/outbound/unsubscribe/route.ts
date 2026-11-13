import { NextRequest, NextResponse } from "next/server";
import { unsubscribeLead } from "@/lib/ads/outbound/server";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const shell = (inner: string) =>
  new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe</title><body style="font:16px/1.5 -apple-system,Segoe UI,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#1d1530">${inner}</body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } },
  );
const done = () => shell("<p>Done. You won't get any more emails from us. Sorry for the bother.</p>");
const invalid = () => shell("<p>That link isn't valid anymore. Reply to the email with \"unsubscribe\" and we'll remove you.</p>");

/**
 * Footer link: shows a one-button confirmation instead of unsubscribing on GET. Corporate mail scanners (Safe Links,
 * Mimecast, Proofpoint...) open every link in an email seconds after delivery; a GET that unsubscribed turned those
 * scans into false opt-outs. Real people press the button (a POST, which scanners don't send).
 */
export async function GET(request: NextRequest) {
  const t = request.nextUrl.searchParams.get("t") ?? "";
  if (!/^[A-Za-z0-9_-]{20,32}$/.test(t)) return invalid();
  return shell(
    `<p>Unsubscribe from Komendly emails?</p><form method="post" action="/api/outbound/unsubscribe?t=${esc(t)}"><input type="hidden" name="confirm" value="1"><button type="submit" style="font:inherit;padding:.6rem 1.2rem;border:0;border-radius:.6rem;background:#ffcf4a;color:#2a0f10;font-weight:700;cursor:pointer">Unsubscribe</button></form>`,
  );
}

/** RFC 8058 one-click (List-Unsubscribe-Post from the mail client, JSON reply) or the confirm button above (HTML reply). */
export async function POST(request: NextRequest) {
  const body = await request.text().catch(() => "");
  const ok = await unsubscribeLead(request.nextUrl.searchParams.get("t") ?? "").catch(() => null);
  if (/(^|&)confirm=1(&|$)/.test(body)) return ok ? done() : invalid();
  return NextResponse.json({ ok: Boolean(ok) }, { status: ok ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}

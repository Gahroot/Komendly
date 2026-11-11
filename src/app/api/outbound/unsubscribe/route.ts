import { NextRequest, NextResponse } from "next/server";
import { unsubscribeLead } from "@/lib/ads/outbound/server";

const page = (msg: string) =>
  new NextResponse(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe</title><body style="font:16px/1.5 -apple-system,Segoe UI,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem"><p>${msg}</p></body>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });

/** Link in the email footer: unsubscribes immediately (no login, no extra click). */
export async function GET(request: NextRequest) {
  const done = await unsubscribeLead(request.nextUrl.searchParams.get("t") ?? "").catch(() => null);
  return page(done ? "Done. You won't get any more emails from us. Sorry for the bother." : "That link isn't valid anymore. Reply to the email with \"unsubscribe\" and we'll remove you.");
}

/** RFC 8058 one-click (List-Unsubscribe-Post) from the mail client. */
export async function POST(request: NextRequest) {
  const done = await unsubscribeLead(request.nextUrl.searchParams.get("t") ?? "").catch(() => null);
  return NextResponse.json({ ok: Boolean(done) }, { status: done ? 200 : 404, headers: { "Cache-Control": "no-store" } });
}

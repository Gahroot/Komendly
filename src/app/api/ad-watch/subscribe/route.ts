import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/ads/mailer";
import { parseAdWatchInput } from "@/lib/growth/ad-watch";
import { subscribeAdWatch } from "@/lib/growth/ad-watch-server";

export const dynamic = "force-dynamic";

/** Public: { email, trade, city, pages[], source } -> double opt-in email. Nothing is sent weekly until confirmed. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseAdWatchInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const source = typeof body.source === "string" ? body.source : "unknown";
  try {
    const r = await subscribeAdWatch(parsed.input, { base: appBaseUrl(request.nextUrl.origin), ip, source });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error("[ad-watch] subscribe failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

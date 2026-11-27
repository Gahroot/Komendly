import { NextRequest, NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/ads/mailer";
import { parseNewsletterInput } from "@/lib/growth/newsletter";
import { subscribeNewsletter } from "@/lib/growth/newsletter-server";

export const dynamic = "force-dynamic";

/** Public: { email, source } -> double opt-in email. Nothing is sent weekly until confirmed. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseNewsletterInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  try {
    const r = await subscribeNewsletter(parsed.email, { base: appBaseUrl(request.nextUrl.origin), ip, source: typeof body.source === "string" ? body.source : "unknown" });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error("[newsletter] subscribe failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

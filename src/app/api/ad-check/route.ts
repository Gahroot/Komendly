import { NextRequest, NextResponse } from "next/server";
import { adCheckEnabled, queueAdCheck } from "@/lib/growth/ad-check-server";

export const dynamic = "force-dynamic";

/** Public (no sign-up) Meta Ad Check: { url, trade?, state? } -> { token } (poll /api/ad-check/<token>). */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { url?: unknown; trade?: unknown; state?: unknown };
  if (!(await adCheckEnabled())) return NextResponse.json({ error: "The ad check is taking a short break. Back soon!", off: true }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  try {
    const r = await queueAdCheck({ ...body, url: body.url }, ip);
    return r.ok ? NextResponse.json({ token: r.token }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error("[ad-check] queue failed", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

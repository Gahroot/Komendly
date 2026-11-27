import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exposeVariant, recordOfferConversions, serveVariant, VISITOR_COOKIE } from "@/lib/offer-intel/server";

// Public (publicPrefixes): offer experiment assignment for client surfaces and exposure/conversion events.
// Subject = kmd_vid cookie (stable across login, so a visitor never flips variant mid-funnel). Everything is a no-op while AdsFeatureFlag sys_offer_intel is off.
const KEY = /^[a-z0-9_.-]{2,64}$/;
const noStore = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const subject = req.cookies.get(VISITOR_COOKIE)?.value;
  const keys = (req.nextUrl.searchParams.get("keys") ?? "").split(",").filter((k) => KEY.test(k)).slice(0, 6);
  const out: Record<string, { variantId: string; payload: Record<string, string> | null }> = {};
  for (const k of keys) { const v = await serveVariant(k, subject); if (v) out[k] = v; }
  return NextResponse.json({ variants: out }, { headers: noStore });
}

const Body = z.object({ type: z.enum(["exposure", "conversion"]), key: z.string().regex(KEY).optional(), event: z.enum(["offer_clicked"]).optional() });

export async function POST(req: NextRequest) {
  const subject = req.cookies.get(VISITOR_COOKIE)?.value;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!subject || !parsed.success) return NextResponse.json({ ok: false }, { status: 400, headers: noStore });
  const b = parsed.data;
  if (/bot|crawl|spider|headless/i.test(req.headers.get("user-agent") ?? "")) return NextResponse.json({ ok: true, skipped: "bot" }, { headers: noStore });
  if (b.type === "exposure" && b.key) {
    await exposeVariant(b.key, subject);
  } else if (b.type === "conversion" && b.event) await recordOfferConversions(b.event, subject);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

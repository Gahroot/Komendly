import { NextResponse } from "next/server";
import { giftByToken, giftView } from "@/lib/ads/gifts";

/** Live gift state for the public gift page while Ozzy is still drawing (the page itself is cached). */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const gift = await giftByToken((await params).token);
  if (!gift) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const v = await giftView(gift);
  return NextResponse.json({ status: v.status, encore: v.encore, expected: v.expected, ads: v.ads }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

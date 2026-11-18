import { NextRequest, NextResponse } from "next/server";
import { isShopDomain, shopHandle, shopifyEnv } from "@/lib/shopify/core";

export const dynamic = "force-dynamic";

/** Install link outside the App Store (e.g. /api/shopify/install?shop=x.myshopify.com): Shopify managed installation. */
export async function GET(request: NextRequest) {
  const env = shopifyEnv();
  const shop = request.nextUrl.searchParams.get("shop")?.toLowerCase() ?? "";
  if (!env) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!isShopDomain(shop)) return NextResponse.redirect("https://apps.shopify.com/");
  return NextResponse.redirect(`https://admin.shopify.com/store/${shopHandle(shop)}/oauth/install?client_id=${encodeURIComponent(env.apiKey)}`);
}

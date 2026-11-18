import { NextRequest, NextResponse } from "next/server";
import { isShopDomain, shopHandle, shopifyEnv, verifyQueryHmac } from "@/lib/shopify/core";
import { shopifyAppHtml } from "@/lib/shopify/page-html";

export const dynamic = "force-dynamic";

/** Embedded app URL (application_url in shopify.app.toml). Served as plain HTML so App Bridge is the first script in <head>. */
export async function GET(request: NextRequest) {
  const env = shopifyEnv();
  const q = request.nextUrl.searchParams;
  const shop = q.get("shop")?.toLowerCase() ?? "";
  if (!env) return new NextResponse("Komendly for Shopify isn't configured yet.", { status: 503 });
  if (!isShopDomain(shop)) return NextResponse.redirect(new URL("/", request.url));
  if (q.has("hmac") && !verifyQueryHmac(q, env.apiSecret)) return new NextResponse("Invalid request signature.", { status: 400 });
  // Opened outside the Shopify admin: send the merchant to the embedded app.
  if (q.get("embedded") !== "1" && !q.get("host")) return NextResponse.redirect(`https://admin.shopify.com/store/${shopHandle(shop)}/apps/${env.apiKey}`);
  return new NextResponse(shopifyAppHtml(env.apiKey), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-security-policy": `frame-ancestors https://${shop} https://admin.shopify.com;`,
    },
  });
}

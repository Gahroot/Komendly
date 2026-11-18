import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isShopDomain, shopifyEnv, verifyWebhookHmac } from "@/lib/shopify/core";
import { handleShopifyWebhook } from "@/lib/shopify/server";

export const dynamic = "force-dynamic";

/** All Shopify webhooks: app/uninstalled, compliance (customers/data_request, customers/redact, shop/redact), app_subscriptions/update. */
export async function POST(request: NextRequest) {
  const raw = await request.text(); // raw body BEFORE verification
  const env = shopifyEnv();
  if (!env || !verifyWebhookHmac(raw, request.headers.get("x-shopify-hmac-sha256"), env.apiSecret)) {
    return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  }
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  if (!isShopDomain(shop)) return NextResponse.json({ error: "invalid shop" }, { status: 400 });
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // compliance webhooks always carry JSON; tolerate empty bodies
  }
  try {
    const result = await handleShopifyWebhook(prisma, { topic, shop, webhookId: request.headers.get("x-shopify-webhook-id"), payload });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[shopify] webhook failed", topic, e);
    return NextResponse.json({ error: "failed" }, { status: 500 }); // Shopify retries
  }
}

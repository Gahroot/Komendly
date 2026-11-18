import { NextResponse } from "next/server";
import { shopifyEnv } from "@/lib/shopify/core";

export const dynamic = "force-dynamic";

/** Synthetic check target for the engine's hourly shopify loop. No secrets in the response. */
export async function GET() {
  const configured = { app: Boolean(shopifyEnv()), tokenKey: Boolean(process.env.ADS_TOKEN_KEY) };
  const ok = configured.app && configured.tokenKey;
  return NextResponse.json({ ok, configured }, { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

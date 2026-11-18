import { NextRequest, NextResponse } from "next/server";
import { createSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shopifyEnv, verifyOpenToken } from "@/lib/shopify/core";

export const dynamic = "force-dynamic";

/** Signed 10-minute link from the embedded app: signs the shop's Komendly user in (top-level tab) and opens their ads. */
export async function GET(request: NextRequest) {
  const env = shopifyEnv();
  const p = env ? verifyOpenToken(request.nextUrl.searchParams.get("t"), env.apiSecret) : null;
  const shop = p ? await prisma.shopifyShop.findFirst({ where: { userId: p.u, uninstalledAt: null }, select: { id: true } }) : null;
  if (!p || !shop) return NextResponse.redirect(new URL("/ads/login", request.url));
  await setSessionCookie(await createSession(p.u));
  return NextResponse.redirect(new URL(p.n, request.url));
}

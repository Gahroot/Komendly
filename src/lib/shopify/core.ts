// Shopify App Store system (growth key "shopify"): pure helpers (no Next, no Prisma). Node crypto only.
// Auth model: embedded app (App Bridge) sends a session token (ID token, HS256 JWT signed with the app secret) on every
// request; the server verifies it and exchanges it for an expiring offline Admin API token (token exchange).
import { createHmac, timingSafeEqual } from "node:crypto";
import { getPlan } from "@/lib/ads/billing-config";

export const SHOPIFY_SYSTEM = "shopify" as const;
export const SHOPIFY_SCOPES = "read_products";
export const SHOPIFY_PLAN_KEYS = ["starter", "ad_department"] as const;
export type ShopifyPlanKey = (typeof SHOPIFY_PLAN_KEYS)[number];
export const UNAVAILABLE_MESSAGE = "Komendly for Shopify is temporarily unavailable for new stores. Please try again in a little while.";

export interface ShopifyEnv { apiKey: string; apiSecret: string; apiVersion: string; billingTest: boolean }
/** Read inside functions (never at module level: undefined on Vercel serverless). */
export function shopifyEnv(env: Record<string, string | undefined> = process.env): ShopifyEnv | null {
  const apiKey = env.SHOPIFY_API_KEY?.trim();
  const apiSecret = env.SHOPIFY_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret, apiVersion: env.SHOPIFY_API_VERSION?.trim() || "2026-10", billingTest: env.SHOPIFY_BILLING_TEST === "1" };
}

export function isShopDomain(shop: string | null | undefined): shop is string {
  return typeof shop === "string" && /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(shop);
}
export const shopHandle = (shop: string) => shop.replace(/\.myshopify\.com$/, "");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Webhooks: X-Shopify-Hmac-Sha256 = base64(HMAC-SHA256(secret, raw body)). Call with request.text() BEFORE parsing. */
export function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  return safeEqual(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"), header);
}

/** App URL / install query: hex HMAC over the sorted `k=v` pairs without `hmac`. */
export function verifyQueryHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get("hmac");
  if (!hmac || !secret) return false;
  const msg = [...params.entries()].filter(([k]) => k !== "hmac" && k !== "signature").sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("&");
  return safeEqual(createHmac("sha256", secret).update(msg).digest("hex"), hmac);
}

const b64url = (s: string) => Buffer.from(s, "base64url").toString("utf8");

/** Verify an App Bridge session token (ID token). Returns the shop domain, or null when invalid. */
export function verifySessionToken(token: string | null | undefined, env: Pick<ShopifyEnv, "apiKey" | "apiSecret">, now: Date = new Date()): { shop: string; sub: string | null } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts as [string, string, string];
  try {
    const header = JSON.parse(b64url(h)) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const expected = createHmac("sha256", env.apiSecret).update(`${h}.${p}`).digest("base64url");
    if (!safeEqual(expected, sig)) return null;
    const c = JSON.parse(b64url(p)) as { iss?: string; dest?: string; aud?: string | string[]; exp?: number; nbf?: number; sub?: string };
    const t = Math.floor(now.getTime() / 1000);
    const leeway = 5;
    if (typeof c.exp !== "number" || c.exp + leeway < t) return null;
    if (typeof c.nbf === "number" && c.nbf - leeway > t) return null;
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!aud.includes(env.apiKey)) return null;
    const dest = c.dest ? new URL(c.dest).hostname : "";
    const iss = c.iss ? new URL(c.iss).hostname : "";
    if (!isShopDomain(dest) || iss !== dest) return null;
    return { shop: dest, sub: c.sub ?? null };
  } catch {
    return null;
  }
}

/** Bearer token from an Authorization header. */
export function bearer(h: string | null): string | null {
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

/** First touch recorded on the sign-up AdsEvent of a shop install (traces to growth system "shopify"). */
export function shopifyFirstTouch(now: Date, shop: string) {
  return { utm_source: "shopify", utm_medium: "app_store", utm_campaign: "app_install", referrer: "admin.shopify.com", landing: `/shopify?shop=${shop}`, at: now.toISOString() };
}

/** Shopify-sold plans map onto the existing ads plans (same price, same monthly credits). */
export function shopifyPlan(key: string) {
  if (!(SHOPIFY_PLAN_KEYS as readonly string[]).includes(key)) return null;
  const p = getPlan(key);
  return p ? { key: p.key as ShopifyPlanKey, name: `Komendly ${p.name}`, priceCents: p.priceCents, credits: p.monthlyCredits } : null;
}
export function planFromChargeName(name: string | null | undefined) {
  return SHOPIFY_PLAN_KEYS.map(shopifyPlan).find((p) => p && p.name === name) ?? null;
}

/** Credit ledger idempotency keys (CreditLedger.stripeRef is @unique): first period, then one per renewed period end. */
export const firstGrantKey = (chargeId: string) => `shopify:${chargeId}:p1`;
export const renewalGrantKey = (chargeId: string, periodEnd: Date) => `shopify:${chargeId}:${periodEnd.toISOString()}`;

export interface ChargeState { status: string; activatedAt: Date | null; periodEnd: Date | null }
export interface ChargeDecision { firstActivation: boolean; renewalAt: Date | null; ended: boolean }

/** Pure: what a charge status update means. A renewal is a later currentPeriodEnd than the one already granted. */
export function chargeDecision(prev: ChargeState, next: { status: string; periodEnd?: Date | null }): ChargeDecision {
  const status = next.status.toUpperCase();
  const active = status === "ACTIVE";
  const renewalAt = active && prev.activatedAt && prev.periodEnd && next.periodEnd && next.periodEnd.getTime() > prev.periodEnd.getTime() ? next.periodEnd : null;
  return { firstActivation: active && !prev.activatedAt, renewalAt, ended: ["CANCELLED", "EXPIRED", "DECLINED", "FROZEN"].includes(status) && prev.status === "ACTIVE" };
}

/** Same store only: ads are made from the merchant's own storefront (primary domain or myshopify domain). */
export function isOwnStoreUrl(url: string, shop: string, storeUrl: string | null): boolean {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
    const own = [shop, storeUrl ? new URL(storeUrl).hostname.replace(/^www\./, "") : null].filter(Boolean);
    return own.includes(host);
  } catch {
    return false;
  }
}

/** Signed, short-lived "open my ads in Komendly" link (top-level tab, sets the session cookie). */
export function signOpenToken(p: { u: string; n: string }, secret: string, now: Date = new Date(), ttlSec = 600): string {
  const body = Buffer.from(JSON.stringify({ ...p, e: Math.floor(now.getTime() / 1000) + ttlSec })).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(`open:${body}`).digest("base64url")}`;
}
export function verifyOpenToken(t: string | null, secret: string, now: Date = new Date()): { u: string; n: string } | null {
  const [body, sig] = (t ?? "").split(".");
  if (!body || !sig || !secret || !safeEqual(createHmac("sha256", secret).update(`open:${body}`).digest("base64url"), sig)) return null;
  try {
    const p = JSON.parse(b64url(body)) as { u?: string; n?: string; e?: number };
    if (!p.u || typeof p.n !== "string" || !p.n.startsWith("/") || p.n.startsWith("//") || !p.e || p.e < now.getTime() / 1000) return null;
    return { u: p.u, n: p.n };
  } catch {
    return null;
  }
}

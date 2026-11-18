// Shopify App Store system (growth key "shopify"): installs, compliance/uninstall webhooks and Billing API grants.
// All DB effects are idempotent (unique shopDomain / chargeId / webhook id / CreditLedger.stripeRef).
import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient, type ShopifyShop } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { grantSubscriptionCredits } from "@/lib/ads/credits";
import { trackAdsEvent } from "@/lib/ads/events";
import { decryptToken, encryptToken, tokenKey } from "@/lib/ads/meta/core/crypto";
import { systemEnabled } from "@/lib/growth/systems";
import { exchangeToken, type ExchangedToken } from "./admin";
import { chargeDecision, firstGrantKey, planFromChargeName, renewalGrantKey, SHOPIFY_SYSTEM, shopHandle, shopifyFirstTouch, shopifyPlan, type ShopifyEnv } from "./core";

export type ShopifyDb = PrismaClient;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const key = () => tokenKey(process.env.ADS_TOKEN_KEY);

function sealed(t: ExchangedToken) {
  const k = key();
  return { accessTokenEnc: encryptToken(t.accessToken, k), refreshTokenEnc: t.refreshToken ? encryptToken(t.refreshToken, k) : null, tokenExpiresAt: t.expiresAt, scopes: t.scope };
}

export interface ShopInstallInput { shop: string; token: ExchangedToken; name: string | null; email: string | null; storeUrl: string | null }
export type EnsureResult = { status: "unavailable" } | { status: "ok"; shop: ShopifyShop; installed: boolean };

/**
 * Called on every embedded app load (after token exchange). New shop: creates a Komendly user + ads workspace (free trial
 * rules apply as for any sign-up) unless the kill switch sys_shopify is off. Existing shops always keep access.
 */
export async function ensureShop(db: ShopifyDb, input: ShopInstallInput, now: Date = new Date()): Promise<EnsureResult> {
  const existing = await db.shopifyShop.findUnique({ where: { shopDomain: input.shop } });
  if (existing) {
    const reinstall = Boolean(existing.uninstalledAt);
    const shop = await db.shopifyShop.update({
      where: { id: existing.id },
      data: { ...sealed(input.token), name: input.name ?? existing.name, storeUrl: input.storeUrl ?? existing.storeUrl, ...(reinstall ? { uninstalledAt: null, redactedAt: null, installedAt: now, email: input.email ?? existing.email } : {}) },
    });
    if (reinstall) await trackAdsEvent("shopify_installed", { workspaceId: shop.workspaceId, userId: shop.userId, props: { system: SHOPIFY_SYSTEM, shop: input.shop, reinstall: true } });
    return { status: "ok", shop, installed: reinstall };
  }
  if (!(await systemEnabled(db, SHOPIFY_SYSTEM))) return { status: "unavailable" };

  // Never link to an existing Komendly account by an unverified shop email: a taken email gets a private alias instead.
  const shopEmail = input.email?.toLowerCase().trim() || null;
  const taken = shopEmail ? await db.user.findUnique({ where: { email: shopEmail }, select: { id: true } }) : null;
  const email = shopEmail && !taken ? shopEmail : `${shopHandle(input.shop)}@shopify.users.komendly.com`;
  const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
  let shop: ShopifyShop;
  try {
    shop = await db.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, passwordHash, name: input.name } });
      const ws = await tx.adsWorkspace.create({ data: { name: input.name ? `${input.name} (Shopify)` : input.shop, ownerId: user.id, members: { create: { userId: user.id, role: "owner" } } } });
      return tx.shopifyShop.create({ data: { shopDomain: input.shop, name: input.name, email: shopEmail, storeUrl: input.storeUrl, userId: user.id, workspaceId: ws.id, installedAt: now, ...sealed(input.token) } });
    });
  } catch (e) {
    // Concurrent first load of the same shop: the other request won (its transaction rolled ours back).
    if (!isUnique(e)) throw e;
    const again = await db.shopifyShop.findUnique({ where: { shopDomain: input.shop } });
    if (!again) throw e;
    return { status: "ok", shop: again, installed: false };
  }
  const base = { workspaceId: shop.workspaceId, userId: shop.userId };
  await trackAdsEvent("signed_up", { ...base, props: { firstTouch: shopifyFirstTouch(now, input.shop), system: SHOPIFY_SYSTEM, via: "shopify" } });
  await trackAdsEvent("shopify_installed", { ...base, props: { system: SHOPIFY_SYSTEM, shop: input.shop } });
  return { status: "ok", shop, installed: true };
}

/** A usable Admin API token: the stored one while valid (>60s left), else a fresh token exchange with this request's ID token. */
export async function adminToken(db: ShopifyDb, shop: ShopifyShop, idToken: string, env: ShopifyEnv, now: Date = new Date()): Promise<string> {
  if (shop.accessTokenEnc && (!shop.tokenExpiresAt || shop.tokenExpiresAt.getTime() - now.getTime() > 60_000)) {
    try {
      return decryptToken(shop.accessTokenEnc, key());
    } catch {
      // fall through to a fresh exchange
    }
  }
  const t = await exchangeToken(shop.shopDomain, idToken, env);
  await db.shopifyShop.update({ where: { id: shop.id }, data: sealed(t) });
  return t.accessToken;
}

export interface SubscriptionUpdate { chargeId: string; status: string; name?: string | null; periodEnd?: Date | null; test?: boolean; planKey?: string | null }

/**
 * Billing API status -> ads plan + credits ledger (mirrors billing-webhook.ts grants). First activation grants the plan's
 * monthly credits (key shopify:<charge>:p1); each later currentPeriodEnd grants one renewal. Safe to replay from both
 * the app_subscriptions/update webhook and the in-app sync.
 */
export async function applyChargeUpdate(db: ShopifyDb, shopDomain: string, u: SubscriptionUpdate, now: Date = new Date()): Promise<{ firstActivation: boolean; granted: number }> {
  const shop = await db.shopifyShop.findUnique({ where: { shopDomain } });
  if (!shop) return { firstActivation: false, granted: 0 };
  let charge = await db.shopifyCharge.findUnique({ where: { chargeId: u.chargeId } });
  if (!charge) {
    const plan = (u.planKey ? shopifyPlan(u.planKey) : null) ?? planFromChargeName(u.name);
    if (!plan) return { firstActivation: false, granted: 0 };
    try {
      charge = await db.shopifyCharge.create({ data: { chargeId: u.chargeId, shopDomain, workspaceId: shop.workspaceId, planKey: plan.key, priceCents: plan.priceCents, status: "PENDING", test: Boolean(u.test) } });
    } catch (e) {
      if (!isUnique(e)) throw e;
      charge = await db.shopifyCharge.findUniqueOrThrow({ where: { chargeId: u.chargeId } });
    }
  }
  const plan = shopifyPlan(charge.planKey);
  if (!plan) return { firstActivation: false, granted: 0 };
  const d = chargeDecision(charge, { status: u.status, periodEnd: u.periodEnd ?? null });
  const status = u.status.toUpperCase();
  let granted = 0;
  let first = false;
  if (status === "ACTIVE") {
    // Claim the first activation atomically: only one caller (webhook or sync) emits the paid events.
    if (d.firstActivation) first = (await db.shopifyCharge.updateMany({ where: { id: charge.id, activatedAt: null }, data: { activatedAt: now } })).count === 1;
    const r1 = await grantSubscriptionCredits(shop.workspaceId, firstGrantKey(charge.chargeId), plan.credits);
    if (r1.applied) granted += r1.delta;
    if (d.renewalAt) {
      const r = await grantSubscriptionCredits(shop.workspaceId, renewalGrantKey(charge.chargeId, d.renewalAt), plan.credits);
      if (r.applied) granted += r.delta;
    }
    await db.shopifyCharge.update({ where: { id: charge.id }, data: { status, ...(u.periodEnd ? { periodEnd: u.periodEnd } : {}) } });
    await db.adsWorkspace.update({ where: { id: shop.workspaceId }, data: { adsPlan: plan.key, subscriptionStatus: "active", canceledAt: null, ...(u.periodEnd ? { currentPeriodEnd: u.periodEnd } : {}) } });
    if (first) {
      const base = { workspaceId: shop.workspaceId, userId: shop.userId };
      const props = { system: SHOPIFY_SYSTEM, kind: "shopify", key: plan.key, chargeId: charge.chargeId, amountCents: charge.test ? 0 : plan.priceCents, currency: "usd", test: charge.test };
      await trackAdsEvent("shopify_charge_activated", { ...base, props });
      if (!charge.test) await trackAdsEvent("purchased", { ...base, props });
    }
  } else {
    await db.shopifyCharge.update({ where: { id: charge.id }, data: { status } });
    if (d.ended) await endShopifyPlanIfNoneActive(db, shop, now);
  }
  return { firstActivation: first, granted };
}

/** Plan switch = new ACTIVE subscription + old one CANCELLED: only drop the plan when no Shopify charge is active and no Stripe plan exists. */
async function endShopifyPlanIfNoneActive(db: ShopifyDb, shop: ShopifyShop, now: Date) {
  const active = await db.shopifyCharge.count({ where: { shopDomain: shop.shopDomain, status: "ACTIVE" } });
  if (active > 0) return;
  const ws = await db.adsWorkspace.findUnique({ where: { id: shop.workspaceId }, select: { stripeSubscriptionId: true } });
  if (!ws || ws.stripeSubscriptionId) return;
  await db.adsWorkspace.update({ where: { id: shop.workspaceId }, data: { subscriptionStatus: "canceled", canceledAt: now } });
}

export interface WebhookInput { topic: string; shop: string; webhookId: string | null; payload: Record<string, unknown> }

/** Verified webhook dispatch. Idempotent per X-Shopify-Webhook-Id (and each handler is idempotent on its own). */
export async function handleShopifyWebhook(db: ShopifyDb, w: WebhookInput, now: Date = new Date()): Promise<"processed" | "duplicate" | "ignored"> {
  if (w.webhookId && (await db.shopifyWebhookEvent.findUnique({ where: { id: w.webhookId } }))) return "duplicate";
  let result: "processed" | "ignored" = "processed";
  switch (w.topic) {
    case "app/uninstalled": {
      const shop = await db.shopifyShop.findUnique({ where: { shopDomain: w.shop } });
      if (shop && !shop.uninstalledAt) {
        await db.shopifyShop.update({ where: { id: shop.id }, data: { uninstalledAt: now, accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null } });
        // Shopify cancels the app subscription on uninstall.
        await db.shopifyCharge.updateMany({ where: { shopDomain: w.shop, status: { in: ["ACTIVE", "PENDING"] } }, data: { status: "CANCELLED" } });
        await endShopifyPlanIfNoneActive(db, shop, now);
        await trackAdsEvent("shopify_uninstalled", { workspaceId: shop.workspaceId, userId: shop.userId, props: { system: SHOPIFY_SYSTEM, shop: w.shop } });
      }
      break;
    }
    case "customers/data_request":
    case "customers/redact":
      // Komendly stores no Shopify customer data (scope read_products only): nothing to return or erase.
      break;
    case "shop/redact": {
      await db.shopifyShop.updateMany({ where: { shopDomain: w.shop, redactedAt: null }, data: { redactedAt: now, name: null, email: null, accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null, scopes: null } });
      break;
    }
    case "app_subscriptions/update": {
      const s = (w.payload.app_subscription ?? {}) as { admin_graphql_api_id?: string; status?: string; name?: string };
      if (s.admin_graphql_api_id && s.status) await applyChargeUpdate(db, w.shop, { chargeId: s.admin_graphql_api_id, status: s.status, name: s.name }, now);
      break;
    }
    default:
      result = "ignored";
  }
  if (w.webhookId) {
    try {
      await db.shopifyWebhookEvent.create({ data: { id: w.webhookId, topic: w.topic, shopDomain: w.shop } });
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  }
  return result;
}

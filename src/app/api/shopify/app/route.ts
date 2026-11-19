import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fingerprintFrom } from "@/lib/ads/run";
import { startRun, StartRunSchema } from "@/lib/ads/run-start";
import { adsErrorResponse, AdsHttpError } from "@/lib/ads/workspace";
import { isPaidWorkspace } from "@/lib/ads/billing-gates";
import { withSystemUtm } from "@/lib/growth/systems";
import { ACTIVE_SUBS_QUERY, adminGraphql, exchangeToken, PRODUCTS_QUERY, SHOP_QUERY, SUBSCRIBE_MUTATION, type ActiveSubsData, type ProductsData, type ShopInfo, type SubscribeData } from "@/lib/shopify/admin";
import { bearer, isOwnStoreUrl, SHOPIFY_PLAN_KEYS, shopHandle, shopifyEnv, shopifyPlan, signOpenToken, UNAVAILABLE_MESSAGE, verifySessionToken } from "@/lib/shopify/core";
import { adminToken, applyChargeUpdate, ensureShop } from "@/lib/shopify/server";
import { productUrl, STORE_DATA_QUERY, storeDataFrom, type StoreDataResponse } from "@/lib/shopify/store-data";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("session") }),
  z.object({ action: z.literal("products") }),
  z.object({ action: z.literal("start"), url: z.string().trim().min(3).max(2048) }),
  z.object({ action: z.literal("run"), runId: z.string().max(64) }),
  z.object({ action: z.literal("subscribe"), plan: z.enum(SHOPIFY_PLAN_KEYS) }),
  z.object({ action: z.literal("sync") }),
]);

const appBase = () => (process.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "");

/** Embedded Shopify admin app API. Authenticated by the App Bridge session token (Authorization: Bearer <id token>), never by cookies. */
export async function POST(request: NextRequest) {
  try {
    const env = shopifyEnv();
    if (!env) throw new AdsHttpError(503, "not_configured", "Komendly for Shopify isn't configured yet.");
    const idToken = bearer(request.headers.get("authorization"));
    const session = verifySessionToken(idToken, env);
    if (!session || !idToken) return NextResponse.json({ error: "Invalid session token", code: "unauthorized" }, { status: 401, headers: { "X-Shopify-Retry-Invalid-Session-Request": "1" } });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AdsHttpError(400, "invalid_input", "Invalid request.");
    const body = parsed.data;
    const shopDomain = session.shop;

    if (body.action === "session") {
      const token = await exchangeToken(shopDomain, idToken, env);
      const info = await adminGraphql<ShopInfo>(shopDomain, token.accessToken, env, SHOP_QUERY);
      const r = await ensureShop(prisma, { shop: shopDomain, token, name: info.shop.name, email: info.shop.email, storeUrl: info.shop.primaryDomain?.url ?? `https://${shopDomain}` });
      if (r.status === "unavailable") return NextResponse.json({ unavailable: true, message: UNAVAILABLE_MESSAGE });
      return NextResponse.json(await stateFor(r.shop.workspaceId, r.shop.storeUrl, r.installed));
    }

    const shop = await prisma.shopifyShop.findUnique({ where: { shopDomain } });
    if (!shop || shop.uninstalledAt) throw new AdsHttpError(409, "reload", "Reload the app to finish setup.");
    const token = await adminToken(prisma, shop, idToken, env);

    if (body.action === "products") {
      const d = await adminGraphql<ProductsData>(shopDomain, token, env, PRODUCTS_QUERY, { n: 24 });
      // Password-protected storefronts (all dev stores) return onlineStoreUrl null: link /products/<handle> instead.
      const base = shop.storeUrl ?? `https://${shopDomain}`;
      return NextResponse.json({ products: d.products.nodes.map((p) => ({ id: p.id, title: p.title, url: productUrl(p, base), image: p.featuredMedia?.preview?.image?.url ?? null })) });
    }
    if (body.action === "start") {
      if (!isOwnStoreUrl(body.url, shopDomain, shop.storeUrl)) throw new AdsHttpError(400, "not_your_store", "Pick your store or one of its products.");
      const [user, workspace] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: shop.userId } }), prisma.adsWorkspace.findUniqueOrThrow({ where: { id: shop.workspaceId } })]);
      // Store content from the Admin API: the engine uses it when the storefront is behind Shopify's password page.
      const shopifyStore = await adminGraphql<StoreDataResponse>(shopDomain, token, env, STORE_DATA_QUERY, { n: 8 })
        .then((d) => storeDataFrom(d, shop.storeUrl ?? `https://${shopDomain}`))
        .catch(() => null);
      // Always re-read the store (products/prices change; also replaces any brand saved from a password page).
      const r = await startRun(StartRunSchema.parse({ url: body.url, reextract: true }), { user, workspace, fp: fingerprintFrom(request), extractPayload: shopifyStore ? { shopifyStore } : undefined });
      return NextResponse.json({ runId: r.runId });
    }
    if (body.action === "run") {
      const run = await prisma.adRun.findFirst({ where: { id: body.runId, workspaceId: shop.workspaceId }, select: { id: true, status: true, _count: { select: { ads: { where: { status: "ready" } } } } } });
      if (!run) throw new AdsHttpError(404, "not_found", "Run not found.");
      const secret = env.apiSecret;
      const openUrl = withSystemUtm(`${appBase()}/api/shopify/open?t=${signOpenToken({ u: shop.userId, n: `/ads/runs/${run.id}` }, secret)}`, "shopify", { campaign: "embedded", content: "open_ads", medium: "app_store" });
      return NextResponse.json({ status: run.status, readyAds: run._count.ads, openUrl });
    }
    if (body.action === "subscribe") {
      const plan = shopifyPlan(body.plan)!;
      const info = await adminGraphql<ShopInfo>(shopDomain, token, env, SHOP_QUERY);
      const test = env.billingTest || Boolean(info.shop.plan?.partnerDevelopment);
      const d = await adminGraphql<SubscribeData>(shopDomain, token, env, SUBSCRIBE_MUTATION, { name: plan.name, returnUrl: `https://admin.shopify.com/store/${shopHandle(shopDomain)}/apps/${env.apiKey}`, test, amount: (plan.priceCents / 100).toFixed(2) });
      const c = d.appSubscriptionCreate;
      if (!c.appSubscription || !c.confirmationUrl) throw new AdsHttpError(502, "billing_failed", c.userErrors[0]?.message ?? "Shopify couldn't start the subscription.");
      await prisma.shopifyCharge.create({ data: { chargeId: c.appSubscription.id, shopDomain, workspaceId: shop.workspaceId, planKey: plan.key, priceCents: plan.priceCents, status: c.appSubscription.status, test } });
      return NextResponse.json({ confirmationUrl: c.confirmationUrl });
    }
    // sync: the merchant came back from approving a charge (or just opened the app): grant what Shopify says is active.
    const d = await adminGraphql<ActiveSubsData>(shopDomain, token, env, ACTIVE_SUBS_QUERY);
    for (const s of d.currentAppInstallation.activeSubscriptions) {
      await applyChargeUpdate(prisma, shopDomain, { chargeId: s.id, status: s.status, name: s.name, test: s.test, periodEnd: s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null });
    }
    return NextResponse.json(await stateFor(shop.workspaceId, shop.storeUrl, false));
  } catch (error) {
    return adsErrorResponse(error);
  }
}

async function stateFor(workspaceId: string, storeUrl: string | null, installed: boolean) {
  const ws = await prisma.adsWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const runs = await prisma.adRun.findMany({ where: { workspaceId, kind: { not: "gift" } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, url: true, status: true, createdAt: true } });
  return {
    installed,
    storeUrl,
    plan: ws.adsPlan,
    paid: isPaidWorkspace(ws),
    credits: ws.creditBalance,
    trialAvailable: !isPaidWorkspace(ws) && !ws.trialUsedAt,
    runs,
    plans: SHOPIFY_PLAN_KEYS.map((k) => shopifyPlan(k)!),
  };
}

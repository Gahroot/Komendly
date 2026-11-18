// Shopify Admin API calls (server only): token exchange (expiring offline token) and GraphQL.
import type { ShopifyEnv } from "./core";

export interface ExchangedToken { accessToken: string; expiresAt: Date | null; refreshToken: string | null; scope: string | null }

/** Token exchange: App Bridge ID token -> expiring offline access token (required for public apps created after 2026-04-01). */
export async function exchangeToken(shop: string, idToken: string, env: ShopifyEnv, fetchFn: typeof fetch = fetch, now: Date = new Date()): Promise<ExchangedToken> {
  const res = await fetchFn(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.apiKey,
      client_secret: env.apiSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: idToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
      expiring: "1",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in?: number; refresh_token?: string; scope?: string };
  return { accessToken: j.access_token, expiresAt: j.expires_in ? new Date(now.getTime() + j.expires_in * 1000) : null, refreshToken: j.refresh_token ?? null, scope: j.scope ?? null };
}

export async function adminGraphql<T>(shop: string, token: string, env: ShopifyEnv, query: string, variables: Record<string, unknown> = {}, fetchFn: typeof fetch = fetch): Promise<T> {
  const res = await fetchFn(`https://${shop}/admin/api/${env.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Shopify Admin API ${res.status}`);
  const j = (await res.json()) as { data?: T; errors?: unknown };
  if (!j.data) throw new Error(`Shopify Admin API error: ${JSON.stringify(j.errors).slice(0, 300)}`);
  return j.data;
}

export const SHOP_QUERY = `{ shop { name email myshopifyDomain primaryDomain { url } plan { partnerDevelopment } } }`;
export interface ShopInfo { shop: { name: string; email: string | null; myshopifyDomain: string; primaryDomain: { url: string } | null; plan: { partnerDevelopment: boolean } | null } }

export const PRODUCTS_QUERY = `query($n: Int!) { products(first: $n, sortKey: UPDATED_AT, reverse: true, query: "status:active") { nodes { id title handle onlineStoreUrl featuredMedia { preview { image { url } } } } } }`;
export interface ProductsData { products: { nodes: Array<{ id: string; title: string; handle: string; onlineStoreUrl: string | null; featuredMedia: { preview: { image: { url: string } | null } | null } | null }> } }

export const SUBSCRIBE_MUTATION = `mutation($name: String!, $returnUrl: URL!, $test: Boolean, $amount: Decimal!) {
  appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: $amount, currencyCode: USD }, interval: EVERY_30_DAYS } } }]) {
    appSubscription { id status } confirmationUrl userErrors { field message }
  }
}`;
export interface SubscribeData { appSubscriptionCreate: { appSubscription: { id: string; status: string } | null; confirmationUrl: string | null; userErrors: Array<{ message: string }> } }

export const ACTIVE_SUBS_QUERY = `{ currentAppInstallation { activeSubscriptions { id name status test currentPeriodEnd } } }`;
export interface ActiveSubsData { currentAppInstallation: { activeSubscriptions: Array<{ id: string; name: string; status: string; test: boolean; currentPeriodEnd: string | null }> } }

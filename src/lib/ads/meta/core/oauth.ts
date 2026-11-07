// OAuth helpers (framework-free): PKCE + Facebook Login for Business (graph mode) + MCP token refresh.
import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_GRAPH_VERSION } from "./graph-publisher";
import { MetaApiError, type FetchLike, type StoredMetaToken } from "./types";

export const GRAPH_SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement"];
export const MCP_SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_manage_ads", "ads_mcp_management"];

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export interface MetaAppConfig { appId: string; appSecret: string; redirectUri: string; graphVersion: string; loginConfigId?: string }

export function graphAuthorizeUrl(c: MetaAppConfig, state: string, verifier: string): string {
  const u = new URL(`https://www.facebook.com/${c.graphVersion || DEFAULT_GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", c.appId);
  u.searchParams.set("redirect_uri", c.redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("code_challenge", pkceChallenge(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  if (c.loginConfigId) u.searchParams.set("config_id", c.loginConfigId); // Facebook Login for Business configuration
  else u.searchParams.set("scope", GRAPH_SCOPES.join(","));
  return u.toString();
}

async function tokenCall(f: FetchLike, url: URL): Promise<{ access_token: string; expires_in?: number; refresh_token?: string }> {
  const res = await f(url);
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: { message?: string } };
  if (!res.ok || !json.access_token) throw new MetaApiError(json.error?.message ?? "Meta token exchange failed", res.status);
  return { access_token: json.access_token, expires_in: json.expires_in, refresh_token: json.refresh_token };
}

/** Code -> short-lived token -> long-lived (~60 day) user token. */
export async function exchangeGraphCode(c: MetaAppConfig, code: string, verifier: string, now: number, f: FetchLike = fetch): Promise<StoredMetaToken> {
  const base = `https://graph.facebook.com/${c.graphVersion || DEFAULT_GRAPH_VERSION}/oauth/access_token`;
  const u1 = new URL(base);
  for (const [k, v] of Object.entries({ client_id: c.appId, client_secret: c.appSecret, redirect_uri: c.redirectUri, code, code_verifier: verifier })) u1.searchParams.set(k, v);
  const short = await tokenCall(f, u1);
  const u2 = new URL(base);
  for (const [k, v] of Object.entries({ grant_type: "fb_exchange_token", client_id: c.appId, client_secret: c.appSecret, fb_exchange_token: short.access_token })) u2.searchParams.set(k, v);
  const long = await tokenCall(f, u2).catch(() => short);
  return { mode: "graph", accessToken: long.access_token, expiresAt: long.expires_in ? now + long.expires_in * 1000 : undefined };
}

/** Refresh an MCP OAuth token (public client, token_endpoint_auth_method=none). */
export async function refreshMcpToken(tokenEndpoint: string, clientId: string, t: StoredMetaToken, now: number, f: FetchLike = fetch): Promise<StoredMetaToken> {
  if (!t.refreshToken) throw new MetaApiError("Meta connection expired. Reconnect your Meta account.");
  const res = await f(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refreshToken, client_id: clientId }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new MetaApiError("Meta connection expired. Reconnect your Meta account.", res.status);
  return { mode: "mcp", accessToken: json.access_token, refreshToken: json.refresh_token ?? t.refreshToken, expiresAt: json.expires_in ? now + json.expires_in * 1000 : undefined };
}

export const META_MCP_TOKEN_ENDPOINT_FALLBACK = "https://graph.facebook.com/v27.0/oauth/access_token";

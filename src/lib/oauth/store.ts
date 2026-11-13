// OAuth 2.1 server state for the hosted Ozzy MCP server: clients (DCR), auth codes, grants and tokens (all hashed).
import type { OAuthClient, User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ads/abuse";
import { trackAdsEvent } from "@/lib/ads/events";
import { API_KEY_LIMITS, type ApiVia } from "@/lib/agent-keys/policy";
import {
  ACCESS_PREFIX, AUTH_METHODS, CLIENT_PREFIX, CODE_PREFIX, OAUTH_SCOPE, REFRESH_PREFIX, TTL, cleanClientName, isAccessToken, isAllowedRedirectUri,
  isAuthCode, isClientId, isRefreshToken, randomToken, resourceOk, safeEqual, sha256Hex, verifyPkce,
} from "./core";

export type OAuthErr = { ok: false; error: string; description: string; status?: number };
export type TokenSet = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };

const err = (error: string, description: string, status = 400): OAuthErr => ({ ok: false, error, description, status });

const RegisterBody = z.object({
  redirect_uris: z.array(z.string()).min(1).max(10),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  client_name: z.string().max(200).optional(),
  scope: z.string().max(200).optional(),
});

/** RFC 7591 registration. Confidential clients get a secret (returned once, stored hashed). */
export async function registerClient(input: unknown, now = new Date()): Promise<{ ok: true; body: Record<string, unknown> } | OAuthErr> {
  const parsed = RegisterBody.safeParse(input);
  if (!parsed.success) return err("invalid_client_metadata", "redirect_uris (1-10) is required.");
  const d = parsed.data;
  const bad = d.redirect_uris.find((u) => !isAllowedRedirectUri(u));
  if (bad !== undefined) return err("invalid_redirect_uri", "Redirect URIs must use https (or http on localhost) and have no fragment.");
  const method = d.token_endpoint_auth_method ?? "client_secret_basic";
  if (!(AUTH_METHODS as readonly string[]).includes(method)) return err("invalid_client_metadata", "Unsupported token_endpoint_auth_method.");
  const grantTypes = d.grant_types ?? ["authorization_code", "refresh_token"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) return err("invalid_client_metadata", "Unsupported grant_types.");
  if ((d.response_types ?? ["code"]).some((r) => r !== "code")) return err("invalid_client_metadata", "Unsupported response_types.");
  const secret = method === "none" ? null : randomToken("kms_", 48);
  const client = await prisma.oAuthClient.create({
    data: { id: randomToken(CLIENT_PREFIX, 32), name: cleanClientName(d.client_name), redirectUris: d.redirect_uris, tokenEndpointAuthMethod: method, secretHash: secret ? sha256Hex(secret) : null, createdAt: now },
  });
  return {
    ok: true,
    body: {
      client_id: client.id,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: method,
      grant_types: grantTypes,
      response_types: ["code"],
      scope: OAUTH_SCOPE,
    },
  };
}

export async function findClient(clientId: string | null | undefined): Promise<OAuthClient | null> {
  if (!clientId || !isClientId(clientId)) return null;
  return prisma.oAuthClient.findUnique({ where: { id: clientId } });
}

/** Token/revocation client auth: public clients send only client_id; confidential ones must prove the secret. */
export async function authenticateClient(clientId: string | null, secret: string | null): Promise<OAuthClient | null> {
  const client = await findClient(clientId);
  if (!client) return null;
  if (client.tokenEndpointAuthMethod === "none") return client;
  if (!secret || !client.secretHash) return null;
  return safeEqual(sha256Hex(secret), client.secretHash) ? client : null;
}

export async function createAuthCode(p: { clientId: string; userId: string; workspaceId: string; redirectUri: string; codeChallenge: string; resource: string; now?: Date }): Promise<string> {
  const now = p.now ?? new Date();
  const code = randomToken(CODE_PREFIX, 40);
  await prisma.oAuthAuthCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86_400_000) } } });
  await prisma.oAuthAuthCode.create({
    data: {
      codeHash: sha256Hex(code), clientId: p.clientId, userId: p.userId, workspaceId: p.workspaceId, redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge, resource: p.resource, scope: OAUTH_SCOPE, expiresAt: new Date(now.getTime() + TTL.codeSeconds * 1000),
    },
  });
  return code;
}

async function issueTokens(grantId: string, now: Date): Promise<TokenSet> {
  const access = randomToken(ACCESS_PREFIX, 40);
  const refresh = randomToken(REFRESH_PREFIX, 40);
  await prisma.oAuthToken.deleteMany({ where: { grantId, expiresAt: { lt: now } } });
  await prisma.oAuthToken.createMany({
    data: [
      { tokenHash: sha256Hex(access), kind: "access", grantId, expiresAt: new Date(now.getTime() + TTL.accessSeconds * 1000) },
      { tokenHash: sha256Hex(refresh), kind: "refresh", grantId, expiresAt: new Date(now.getTime() + TTL.refreshSeconds * 1000) },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: TTL.accessSeconds, refresh_token: refresh, scope: OAUTH_SCOPE };
}

export async function revokeGrant(grantId: string, now = new Date()): Promise<void> {
  await prisma.oAuthGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: now } });
  await prisma.oAuthToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } });
}

/** authorization_code grant: single use (a replay revokes what the code issued), PKCE S256, exact redirect_uri, same client. */
export async function exchangeCode(p: { client: OAuthClient; code: string; verifier: string; redirectUri: string | null; resource: string | null; origin: string; now?: Date }): Promise<{ ok: true; tokens: TokenSet } | OAuthErr> {
  const now = p.now ?? new Date();
  const invalid = err("invalid_grant", "The authorization code is invalid, expired or already used.");
  if (!isAuthCode(p.code)) return invalid;
  const row = await prisma.oAuthAuthCode.findUnique({ where: { codeHash: sha256Hex(p.code) } });
  if (!row) return invalid;
  if (row.usedAt) {
    if (row.grantId) await revokeGrant(row.grantId, now);
    return invalid;
  }
  if (row.clientId !== p.client.id || row.expiresAt < now) return invalid;
  if (!p.redirectUri || p.redirectUri !== row.redirectUri) return err("invalid_grant", "redirect_uri doesn't match the authorization request.");
  if (!resourceOk(p.resource, p.origin)) return err("invalid_target", "Unknown resource.");
  const claimed = await prisma.oAuthAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) return invalid;
  if (!verifyPkce(p.verifier, row.codeChallenge)) return err("invalid_grant", "code_verifier doesn't match the code_challenge.");
  const existing = await prisma.oAuthGrant.findFirst({ where: { userId: row.userId, clientId: row.clientId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  const grant = existing ?? (await prisma.oAuthGrant.create({ data: { userId: row.userId, workspaceId: row.workspaceId, clientId: row.clientId, clientName: p.client.name, scope: row.scope } }));
  await prisma.oAuthAuthCode.update({ where: { id: row.id }, data: { grantId: grant.id } });
  return { ok: true, tokens: await issueTokens(grant.id, now) };
}

/** refresh_token grant with rotation: the old token is spent; presenting a spent one revokes the whole grant. */
export async function refreshTokens(p: { client: OAuthClient; refreshToken: string; resource: string | null; origin: string; now?: Date }): Promise<{ ok: true; tokens: TokenSet } | OAuthErr> {
  const now = p.now ?? new Date();
  const invalid = err("invalid_grant", "The refresh token is invalid, expired or revoked.");
  if (!isRefreshToken(p.refreshToken)) return invalid;
  if (!resourceOk(p.resource, p.origin)) return err("invalid_target", "Unknown resource.");
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash: sha256Hex(p.refreshToken) }, include: { grant: true } });
  if (!row || row.kind !== "refresh" || row.grant.clientId !== p.client.id) return invalid;
  if (row.usedAt) {
    await revokeGrant(row.grantId, now);
    return invalid;
  }
  if (row.revokedAt || row.grant.revokedAt || row.expiresAt < now) return invalid;
  const claimed = await prisma.oAuthToken.updateMany({ where: { id: row.id, usedAt: null, revokedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) {
    await revokeGrant(row.grantId, now);
    return invalid;
  }
  return { ok: true, tokens: await issueTokens(row.grantId, now) };
}

/** RFC 7009: revoking a refresh token disconnects the app; an access token is revoked alone. Unknown tokens are a no-op. */
export async function revokeToken(client: OAuthClient, token: string, now = new Date()): Promise<void> {
  if (!isAccessToken(token) && !isRefreshToken(token)) return;
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { grant: true } });
  if (!row || row.grant.clientId !== client.id) return;
  if (row.kind === "refresh") await revokeGrant(row.grantId, now);
  else await prisma.oAuthToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now } });
}

export type AccessResult = { ok: true; user: User; keyId: string; workspaceId: string } | { ok: false; reason: "invalid" | "rate_limited" };

/** kmo_ access token -> user. The grant id is the agent keyId, so per-key limits and api_used reuse the API key paths. */
export async function resolveAccessToken(raw: string, opts: { via: ApiVia; now?: Date }): Promise<AccessResult> {
  const now = opts.now ?? new Date();
  if (!isAccessToken(raw)) return { ok: false, reason: "invalid" };
  const row = await prisma.oAuthToken.findUnique({ where: { tokenHash: sha256Hex(raw) }, include: { grant: { include: { user: true } } } });
  if (!row || row.kind !== "access" || row.revokedAt || row.expiresAt < now || row.grant.revokedAt) return { ok: false, reason: "invalid" };
  const grant = row.grant;
  if (!(await rateLimit(`apikey:${grant.id}`, API_KEY_LIMITS.perMinute, 60))) return { ok: false, reason: "rate_limited" };
  await touchGrant(grant.id, grant.userId, grant.workspaceId, opts.via, now);
  return { ok: true, user: grant.user, keyId: grant.id, workspaceId: grant.workspaceId };
}

async function touchGrant(grantId: string, userId: string, workspaceId: string, via: ApiVia, now: Date): Promise<void> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const first = await prisma.oAuthGrant.updateMany({ where: { id: grantId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: dayStart } }] }, data: { lastUsedAt: now } });
  if (first.count === 1) {
    await trackAdsEvent("api_used", { workspaceId, userId, props: { via, keyId: grantId, auth: "oauth" } });
    return;
  }
  await prisma.oAuthGrant.updateMany({ where: { id: grantId, lastUsedAt: { lt: new Date(now.getTime() - 60_000) } }, data: { lastUsedAt: now } });
}

export function grantView(g: { id: string; clientName: string; createdAt: Date; lastUsedAt: Date | null }) {
  return { id: g.id, name: g.clientName, createdAt: g.createdAt.toISOString(), lastUsedAt: g.lastUsedAt?.toISOString() ?? null };
}
export type GrantView = ReturnType<typeof grantView>;

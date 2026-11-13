// Hits the dev DB from .env.local (creates and deletes its own user, workspace and OAuth client).
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

import type { OAuthClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateWorkspace } from "@/lib/ads/workspace";
import { handleMcp } from "@/lib/agent-keys/mcp-handler";
import { generateApiKey, hashApiKey, keyPrefix } from "@/lib/agent-keys/keys";
import { isRefusedForApiKey } from "@/lib/agent-keys/policy";
import {
  authorizationServerMetadata, isAllowedRedirectUri, protectedResourceMetadata, redirectUriMatches, signConsent, verifyConsent, verifyPkce, wwwAuthenticate,
} from "../core";
import { checkAuthorizeRequest } from "../authorize";
import { authenticateClient, createAuthCode, exchangeCode, refreshTokens, registerClient, resolveAccessToken, revokeToken } from "../store";
import { POST as tokenPOST } from "@/app/api/oauth/token/route";
import { GET as prmGET } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

const ORIGIN = "http://localhost:3000";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const tag = `oauth-test-${Date.now()}`;
let userId = "";
let workspaceId = "";
let client: OAuthClient;
const clientIds: string[] = [];

function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  return { verifier, challenge: crypto.createHash("sha256").update(verifier).digest("base64url") };
}

async function newCode(challenge: string) {
  return createAuthCode({ clientId: client.id, userId, workspaceId, redirectUri: REDIRECT, codeChallenge: challenge, resource: `${ORIGIN}/api/mcp` });
}

async function tokens() {
  const p = pkce();
  const code = await newCode(p.challenge);
  const r = await exchangeCode({ client, code, verifier: p.verifier, redirectUri: REDIRECT, resource: `${ORIGIN}/api/mcp`, origin: ORIGIN });
  if (!r.ok) throw new Error(r.description);
  return r.tokens;
}

function rpc(body: unknown, auth: string | null) {
  return new Request(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `${tag}@example.com`, passwordHash: "x", name: "OAuth" } });
  userId = user.id;
  workspaceId = (await getOrCreateWorkspace(user)).id;
  const reg = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" });
  if (!reg.ok) throw new Error(reg.description);
  const found = await prisma.oAuthClient.findUnique({ where: { id: String(reg.body.client_id) } });
  if (!found) throw new Error("client missing");
  client = found;
  clientIds.push(client.id);
});

afterAll(async () => {
  await prisma.oAuthAuthCode.deleteMany({ where: { userId } });
  await prisma.oAuthClient.deleteMany({ where: { id: { in: clientIds } } });
  await prisma.adsEvent.deleteMany({ where: { userId } });
  await prisma.adsWorkspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("metadata", () => {
  it("protected resource + authorization server shapes", async () => {
    expect(protectedResourceMetadata("https://www.komendly.com")).toMatchObject({
      resource: "https://www.komendly.com/api/mcp", authorization_servers: ["https://www.komendly.com"], scopes_supported: ["ozzy"], bearer_methods_supported: ["header"],
    });
    const as = authorizationServerMetadata("https://www.komendly.com");
    expect(as).toMatchObject({
      issuer: "https://www.komendly.com",
      authorization_endpoint: "https://www.komendly.com/oauth/authorize",
      token_endpoint: "https://www.komendly.com/api/oauth/token",
      registration_endpoint: "https://www.komendly.com/api/oauth/register",
      revocation_endpoint: "https://www.komendly.com/api/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: ["ozzy"],
    });
    const res = await prmGET(new Request("http://internal/.well-known/oauth-protected-resource/api/mcp", { headers: { host: "www.komendly.com", "x-forwarded-proto": "https" } }));
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(((await res.json()) as { resource: string }).resource).toBe("https://www.komendly.com/api/mcp");
  });
});

describe("dynamic client registration", () => {
  it("validates redirect URIs", async () => {
    expect(isAllowedRedirectUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:33418/")).toBe(true);
    expect(isAllowedRedirectUri("http://evil.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("https://a.com/cb#frag")).toBe(false);
    expect((await registerClient({ redirect_uris: ["http://evil.com/cb"] })).ok).toBe(false);
    expect((await registerClient({ redirect_uris: [] })).ok).toBe(false);
    expect((await registerClient({ redirect_uris: [REDIRECT], grant_types: ["client_credentials"] })).ok).toBe(false);
  });

  it("confidential clients must present their secret", async () => {
    const reg = await registerClient({ client_name: "Cursor", redirect_uris: ["https://cursor.com/cb"] });
    if (!reg.ok) throw new Error("register failed");
    const id = String(reg.body.client_id);
    clientIds.push(id);
    expect(reg.body.token_endpoint_auth_method).toBe("client_secret_basic");
    expect(await authenticateClient(id, null)).toBeNull();
    expect(await authenticateClient(id, "kms_wrong")).toBeNull();
    expect((await authenticateClient(id, String(reg.body.client_secret)))?.id).toBe(id);
  });
});

describe("authorize + code exchange", () => {
  it("PKCE S256 verify", () => {
    const p = pkce();
    expect(verifyPkce(p.verifier, p.challenge)).toBe(true);
    expect(verifyPkce(`${p.verifier}x`, p.challenge)).toBe(false);
    expect(verifyPkce("short", p.challenge)).toBe(false);
  });

  it("authorize request: exact redirect_uri, PKCE required, resource checked", async () => {
    const base = { client_id: client.id, redirect_uri: REDIRECT, response_type: "code", code_challenge: pkce().challenge, code_challenge_method: "S256", state: "xyz" };
    const check = (o: Record<string, string>) => checkAuthorizeRequest((k) => o[k] ?? null, ORIGIN);
    expect((await check(base)).kind).toBe("ok");
    expect((await check({ ...base, redirect_uri: `${REDIRECT}/x` })).kind).toBe("fatal");
    expect((await check({ ...base, client_id: "kmc_nope" })).kind).toBe("fatal");
    const noPkce = await check({ ...base, code_challenge_method: "plain" });
    expect(noPkce.kind === "redirect" && noPkce.url).toMatch(/^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?error=invalid_request.*state=xyz/);
    expect((await check({ ...base, resource: "https://evil.com/mcp" })).kind).toBe("redirect");
    expect((await check({ ...base, resource: `${ORIGIN}/api/mcp` })).kind).toBe("ok");
    expect(redirectUriMatches(["http://127.0.0.1:1234/cb"], "http://127.0.0.1:5555/cb")).toBe(true);
  });

  it("consent token is bound to the session", () => {
    const t = signConsent("sess-a", { client_id: "c", user_id: "u" }, Date.now() + 60_000);
    expect(verifyConsent("sess-a", t, Date.now())).toEqual({ client_id: "c", user_id: "u" });
    expect(verifyConsent("sess-b", t, Date.now())).toBeNull();
    expect(verifyConsent("sess-a", t, Date.now() + 120_000)).toBeNull();
  });

  it("code is single use; replay revokes the tokens it issued", async () => {
    const p = pkce();
    const code = await newCode(p.challenge);
    const args = { client, code, verifier: p.verifier, redirectUri: REDIRECT, resource: null, origin: ORIGIN };
    const first = await exchangeCode(args);
    expect(first.ok).toBe(true);
    const again = await exchangeCode(args);
    expect(again).toMatchObject({ ok: false, error: "invalid_grant" });
    if (first.ok) expect((await resolveAccessToken(first.tokens.access_token, { via: "mcp" })).ok).toBe(false);
  });

  it("rejects redirect mismatch, wrong verifier and other clients", async () => {
    const p = pkce();
    expect(await exchangeCode({ client, code: await newCode(p.challenge), verifier: p.verifier, redirectUri: "https://claude.ai/other", resource: null, origin: ORIGIN })).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(await exchangeCode({ client, code: await newCode(p.challenge), verifier: pkce().verifier, redirectUri: REDIRECT, resource: null, origin: ORIGIN })).toMatchObject({ ok: false, error: "invalid_grant" });
    const other = { ...client, id: "kmc_00000000000000000000000000000000" };
    expect(await exchangeCode({ client: other, code: await newCode(p.challenge), verifier: p.verifier, redirectUri: REDIRECT, resource: null, origin: ORIGIN })).toMatchObject({ ok: false });
  });

  it("token endpoint speaks form-encoded OAuth", async () => {
    const p = pkce();
    const code = await newCode(p.challenge);
    const body = new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: p.verifier, redirect_uri: REDIRECT, client_id: client.id });
    const res = await tokenPOST(new Request(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": `10.9.${Date.now() % 250}.1` }, body }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const json = (await res.json()) as { access_token: string; refresh_token: string; token_type: string };
    expect(json.access_token).toMatch(/^kmo_/);
    expect(json.refresh_token).toMatch(/^kmr_/);
    const bad = await tokenPOST(new Request(`${ORIGIN}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: "kmc_nope" }) }));
    expect(bad.status).toBe(401);
    expect(await bad.json()).toMatchObject({ error: "invalid_client" });
  });
});

describe("refresh", () => {
  it("rotates, and reuse revokes the whole grant", async () => {
    const t1 = await tokens();
    const r2 = await refreshTokens({ client, refreshToken: t1.refresh_token, resource: null, origin: ORIGIN });
    if (!r2.ok) throw new Error(r2.description);
    expect(r2.tokens.refresh_token).not.toBe(t1.refresh_token);
    expect((await resolveAccessToken(r2.tokens.access_token, { via: "mcp" })).ok).toBe(true);
    const reuse = await refreshTokens({ client, refreshToken: t1.refresh_token, resource: null, origin: ORIGIN });
    expect(reuse).toMatchObject({ ok: false, error: "invalid_grant" });
    expect((await resolveAccessToken(r2.tokens.access_token, { via: "mcp" })).ok).toBe(false);
    expect((await refreshTokens({ client, refreshToken: r2.tokens.refresh_token, resource: null, origin: ORIGIN })).ok).toBe(false);
  });

  it("revocation endpoint logic disconnects on refresh token", async () => {
    const t = await tokens();
    await revokeToken(client, t.refresh_token);
    expect((await resolveAccessToken(t.access_token, { via: "mcp" })).ok).toBe(false);
  });
});

describe("MCP auth", () => {
  it("401 carries the resource metadata challenge", async () => {
    const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, null), null);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(wwwAuthenticate(ORIGIN));
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
    const bad = await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, `kmo_${"a".repeat(40)}`), null);
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("accepts a kmo_ access token (get_account) and a kmd_ key", async () => {
    const t = await tokens();
    const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_account", arguments: {} } }, t.access_token), null);
    const body = (await res.json()) as { result: { isError?: boolean; structuredContent: Record<string, unknown> } };
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent).toMatchObject({ plan: "free" });
    const key = generateApiKey();
    await prisma.agentApiKey.create({ data: { userId, workspaceId, name: "cli", prefix: keyPrefix(key), keyHash: hashApiKey(key) } });
    const res2 = await handleMcp(rpc({ jsonrpc: "2.0", id: 3, method: "tools/list" }, key), null);
    expect(res2.status).toBe(200);
  });

  it("OAuth and key management routes refuse bearer credentials", () => {
    expect(isRefusedForApiKey("/api/account/connections")).toBe(true);
    expect(isRefusedForApiKey("/api/oauth/authorize")).toBe(true);
  });
});

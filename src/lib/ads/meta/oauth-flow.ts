// Server-side OAuth connect/callback for both modes. State + PKCE verifier live in MetaOAuthState.
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { prisma } from "@/lib/prisma";
import { AdsHttpError } from "@/lib/ads/workspace";
import { META_MCP_URL } from "./core/mcp-publisher";
import { MCP_SCOPES, exchangeGraphCode, graphAuthorizeUrl, randomToken } from "./core/oauth";
import type { MetaAppConfig } from "./core/oauth";
import type { MetaPublishMode, StoredMetaToken } from "./core/types";
import { OAUTH_STATE_TTL_MS, saveMetaToken } from "./connection";

/**
 * MCP auth-spec client backed by our pre-registered Meta app (Meta's DCR endpoint rejects
 * third-party clients, so client_id = META_APP_ID, public client with PKCE).
 */
class MetaMcpOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null;
  savedTokens: OAuthTokens | null = null;
  constructor(private readonly c: MetaAppConfig, private readonly st: string, private verifier: string) {}
  get redirectUrl() { return this.c.redirectUri; }
  get clientMetadata(): OAuthClientMetadata {
    return { client_name: "Komendly Website2ads", redirect_uris: [this.c.redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
  }
  state() { return this.st; }
  clientInformation() { return { client_id: this.c.appId }; }
  tokens() { return undefined; }
  saveTokens(t: OAuthTokens) { this.savedTokens = t; }
  redirectToAuthorization(url: URL) { this.authorizationUrl = url; }
  saveCodeVerifier(v: string) { this.verifier = v; }
  codeVerifier() { return this.verifier; }
}

export async function startMetaConnect(o: { config: MetaAppConfig; mode: MetaPublishMode; workspaceId: string; userId: string }): Promise<string> {
  const state = randomToken();
  await prisma.metaOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  let url: string;
  let verifier: string;
  if (o.mode === "mcp") {
    const provider = new MetaMcpOAuthProvider(o.config, state, "");
    const result = await auth(provider, { serverUrl: META_MCP_URL, scope: MCP_SCOPES.join(" ") });
    if (result !== "REDIRECT" || !provider.authorizationUrl) throw new AdsHttpError(502, "meta_auth_failed", "Couldn't start Meta sign-in.");
    url = provider.authorizationUrl.toString();
    verifier = provider.codeVerifier();
  } else {
    verifier = randomToken(48);
    url = graphAuthorizeUrl(o.config, state, verifier);
  }
  await prisma.metaOAuthState.create({
    data: { state, workspaceId: o.workspaceId, userId: o.userId, mode: o.mode, codeVerifier: verifier, expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) },
  });
  return url;
}

/** Validates + consumes the state (single use, same user), exchanges the code and stores the encrypted token. */
export async function finishMetaConnect(o: { config: MetaAppConfig; state: string; code: string; userId: string }): Promise<string> {
  const row = await prisma.metaOAuthState.findUnique({ where: { state: o.state } });
  if (row) await prisma.metaOAuthState.delete({ where: { state: o.state } });
  if (!row || row.userId !== o.userId || row.expiresAt < new Date()) {
    throw new AdsHttpError(400, "meta_bad_state", "This Meta sign-in link expired. Please try again.");
  }
  const now = Date.now();
  let token: StoredMetaToken;
  if (row.mode === "mcp") {
    const provider = new MetaMcpOAuthProvider(o.config, row.state, row.codeVerifier);
    const result = await auth(provider, { serverUrl: META_MCP_URL, authorizationCode: o.code, scope: MCP_SCOPES.join(" ") });
    const t = provider.savedTokens;
    if (result !== "AUTHORIZED" || !t) throw new AdsHttpError(502, "meta_auth_failed", "Meta sign-in failed.");
    token = { mode: "mcp", accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_in ? now + t.expires_in * 1000 : undefined };
  } else {
    token = await exchangeGraphCode(o.config, o.code, row.codeVerifier, now);
  }
  await saveMetaToken(row.workspaceId, token);
  return row.workspaceId;
}

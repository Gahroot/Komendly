// OAuth token endpoint: authorization_code (PKCE S256) and refresh_token (rotating).
import { originOf } from "@/lib/oauth/core";
import { authenticateClient, exchangeCode, refreshTokens } from "@/lib/oauth/store";
import { clientCredentials, ipLimit, oauthError, oauthJson, preflight, readForm } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await ipLimit(request, "token", 60, 60))) return oauthError("too_many_requests", "Too many token requests. Try again in a minute.", 429, { "Retry-After": "60" });
  const form = await readForm(request);
  const { clientId, secret } = clientCredentials(request, form);
  const client = await authenticateClient(clientId, secret);
  if (!client) return oauthError("invalid_client", "Unknown client or bad client credentials.", 401);
  const origin = originOf(request);
  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code || !verifier) return oauthError("invalid_request", "code and code_verifier are required.");
    const r = await exchangeCode({ client, code, verifier, redirectUri: form.get("redirect_uri"), resource: form.get("resource"), origin });
    return r.ok ? oauthJson(r.tokens) : oauthError(r.error, r.description, r.status);
  }
  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken) return oauthError("invalid_request", "refresh_token is required.");
    const r = await refreshTokens({ client, refreshToken, resource: form.get("resource"), origin });
    return r.ok ? oauthJson(r.tokens) : oauthError(r.error, r.description, r.status);
  }
  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export function OPTIONS() {
  return preflight();
}

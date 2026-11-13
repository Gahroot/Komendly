// OAuth 2.1 for the hosted Ozzy MCP server: pure helpers (formats, hashing, PKCE, redirect URI rules, metadata). Node only.
import crypto from "node:crypto";

export const OAUTH_SCOPE = "ozzy";
export const MCP_PATH = "/api/mcp";
export const ACCESS_PREFIX = "kmo_";
export const REFRESH_PREFIX = "kmr_";
export const CLIENT_PREFIX = "kmc_";
export const CODE_PREFIX = "kma_";
export const TTL = { codeSeconds: 600, accessSeconds: 3600, refreshSeconds: 60 * 24 * 3600, consentSeconds: 900 } as const;
export const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"] as const;
export type AuthMethod = (typeof AUTH_METHODS)[number];

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** prefix + n base62 chars (rejection sampling, no modulo bias). */
export function randomToken(prefix: string, length = 40): string {
  let body = "";
  while (body.length < length) {
    for (const b of crypto.randomBytes(64)) if (b < 248 && body.length < length) body += BASE62[b % 62];
  }
  return prefix + body;
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const tokenRe = (prefix: string, n: number) => new RegExp(`^${prefix}[0-9A-Za-z]{${n}}$`);
export const isAccessToken = (s: string) => tokenRe(ACCESS_PREFIX, 40).test(s);
export const isRefreshToken = (s: string) => tokenRe(REFRESH_PREFIX, 40).test(s);
export const isClientId = (s: string) => tokenRe(CLIENT_PREFIX, 32).test(s);
export const isAuthCode = (s: string) => tokenRe(CODE_PREFIX, 40).test(s);

/** The kmo_ access token from an Authorization header, or null. */
export function parseOAuthBearer(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header?.trim() ?? "");
  const t = m?.[1];
  return t && isAccessToken(t) ? t : null;
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) == challenge; verifier is 43-128 unreserved chars. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return safeEqual(crypto.createHash("sha256").update(verifier).digest("base64url"), challenge);
}

export function isValidChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

/** https anywhere, or http only on loopback (native clients). No fragments, no credentials. */
export function isAllowedRedirectUri(raw: string): boolean {
  if (raw.length > 2000) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
}

/** Exact string match; for loopback redirects the port may differ (RFC 8252 7.3). */
export function redirectUriMatches(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  if (req.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(req.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && u.hostname === req.hostname && u.pathname === req.pathname && u.search === req.search;
    } catch {
      return false;
    }
  });
}

/** Public origin (proxy-aware; only host/proto headers are read). */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Same as originOf for server components (next/headers). */
export function originFromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || "www.komendly.com";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (local ? "http" : "https");
  return `${proto}://${host}`;
}

export function mcpResource(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

/** `resource` (RFC 8707) is optional; if sent it must name the MCP server. */
export function resourceOk(resource: string | null | undefined, origin: string): boolean {
  if (!resource) return true;
  const want = mcpResource(origin);
  return resource === want || resource === `${want}/`;
}

export function protectedResourceMetadata(origin: string) {
  return { resource: mcpResource(origin), authorization_servers: [origin], scopes_supported: [OAUTH_SCOPE], bearer_methods_supported: ["header"], resource_name: "Ozzy by Komendly" };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [...AUTH_METHODS],
    revocation_endpoint_auth_methods_supported: [...AUTH_METHODS],
    scopes_supported: [OAUTH_SCOPE],
  };
}

export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

export function wwwAuthenticate(origin: string, error?: "invalid_token"): string {
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl(origin)}"`, `scope="${OAUTH_SCOPE}"`];
  if (error) parts.push(`error="${error}"`);
  return parts.join(", ");
}

/** Consent form token: HMAC keyed by the session token, so only that signed-in browser can submit it. */
export function signConsent(sessionToken: string, payload: Record<string, string>, exp: number): string {
  const body = Buffer.from(JSON.stringify({ ...sortObj(payload), exp })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", `oauth-consent:${sessionToken}`).update(body).digest("base64url")}`;
}

export function verifyConsent(sessionToken: string, token: string, now: number): Record<string, string> | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const want = crypto.createHmac("sha256", `oauth-consent:${sessionToken}`).update(body).digest("base64url");
  if (!safeEqual(mac, want)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const { exp, ...rest } = parsed as Record<string, unknown>;
    if (typeof exp !== "number" || exp < now) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) if (typeof v === "string") out[k] = v;
    return out;
  } catch {
    return null;
  }
}

function sortObj(o: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

/** Shown on the consent screen; strips control chars and caps length. */
export function cleanClientName(name: unknown): string {
  const s = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 60) : "";
  return s || "An AI app";
}

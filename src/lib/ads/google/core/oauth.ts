// "Sign in with Google" for Google Ads (framework-free; Web Crypto only, no node:crypto).
import { GOOGLE_TOKEN_URL } from "./client";
import { GoogleAdsApiError, type FetchLike, type StoredGoogleToken } from "./types";

export const GOOGLE_ADS_SCOPES = ["https://www.googleapis.com/auth/adwords", "openid", "email"];
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export interface GoogleOAuthConfig { clientId: string; clientSecret: string; redirectUri: string }

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomUrlToken(bytes = 32): string {
  return b64url(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceS256(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** Consent URL: offline access (refresh token) and prompt=consent so Google always returns one. */
export async function googleAuthUrl(c: GoogleOAuthConfig, state: string, verifier: string): Promise<string> {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("redirect_uri", c.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_ADS_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", await pkceS256(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

/** Email claim of an id_token we received directly from Google's token endpoint over TLS (no signature check needed). */
export function idTokenEmail(idToken: string | undefined): string | null {
  const part = idToken?.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="))) as { email?: unknown; email_verified?: unknown };
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

export interface ExchangedToken { token: StoredGoogleToken; accessToken: string; email: string | null }

export async function exchangeGoogleCode(c: GoogleOAuthConfig, code: string, verifier: string, f: FetchLike = fetch): Promise<ExchangedToken> {
  const res = await f(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; id_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new GoogleAdsApiError(`Google sign-in failed (${json.error ?? res.status})`, res.status);
  if (!json.refresh_token) throw new GoogleAdsApiError("Google didn't return offline access. Please try again.", 400, ["no_refresh_token"]);
  if (json.scope && !json.scope.split(" ").includes(GOOGLE_ADS_SCOPES[0]!)) {
    throw new GoogleAdsApiError("Please allow Komendly to manage your Google Ads campaigns (the Google Ads box was unticked).", 400, ["scope_missing"]);
  }
  return { token: { refreshToken: json.refresh_token, scope: json.scope }, accessToken: json.access_token, email: idTokenEmail(json.id_token) };
}

/** Revoke the grant at Google (best effort). */
export async function revokeGoogleGrant(token: string, f: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await f(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

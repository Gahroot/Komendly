// Jobber App Marketplace system (growth key "jobber"): pure helpers (no Next, no Prisma). Node crypto only.
// OAuth 2.0 authorization code grant (+ PKCE when we start the flow; the Marketplace "Connect" button sends no state/PKCE),
// webhooks signed with X-Jobber-Hmac-SHA256 = base64(HMAC-SHA256(client secret, raw body)). docs/integrations/jobber-listing.md
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const JOBBER_SYSTEM = "jobber" as const;
export const JOBBER_AUTHORIZE_URL = "https://api.getjobber.com/api/oauth/authorize";
export const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
/** Pinned GraphQL version (developer.getjobber.com/docs/changelog). Versions are supported ~18 months. */
export const JOBBER_DEFAULT_VERSION = "2026-09-25";
export const JOBBER_DEFAULT_REDIRECT = "https://komendly.com/api/integrations/jobber/callback";
/** httpOnly cookie holding `<state nonce>.<PKCE verifier>` between authorize and callback. */
export const PKCE_COOKIE = "kmd_jobber_pkce";
export const STATE_TTL_SEC = 600; // Jobber auth codes live 10 minutes too
export const CONNECT_TTL_SEC = 7 * 24 * 3600;

export interface JobberEnv { clientId: string; clientSecret: string; redirectUri: string; apiVersion: string }
/** Read inside functions (never at module level: undefined on Vercel serverless). */
export function jobberEnv(env: Record<string, string | undefined> = process.env): JobberEnv | null {
  const clientId = env.JOBBER_CLIENT_ID?.trim();
  const clientSecret = env.JOBBER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: env.JOBBER_REDIRECT_URI?.trim() || JOBBER_DEFAULT_REDIRECT, apiVersion: env.JOBBER_GRAPHQL_VERSION?.trim() || JOBBER_DEFAULT_VERSION };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const sign = (secret: string, purpose: string, body: string) => createHmac("sha256", secret).update(`${purpose}:${body}`).digest("base64url");

/** Webhooks: compare base64 HMAC of the raw body (call with request.text() BEFORE parsing). */
export function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  return safeEqual(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"), header.trim());
}

// ---- PKCE + state ----
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url"); // 64 chars, RFC 7636 unreserved set
  return { verifier, challenge: pkceChallenge(verifier) };
}
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/** Signed, expiring state: `<nonce>.<exp>.<sig>`. The nonce is also in the PKCE cookie (binds the flow to this browser). */
export function signState(nonce: string, secret: string, now: Date = new Date()): string {
  const body = `${nonce}.${Math.floor(now.getTime() / 1000) + STATE_TTL_SEC}`;
  return `${body}.${sign(secret, "state", body)}`;
}
export function verifyState(state: string | null | undefined, cookie: string | null | undefined, secret: string, now: Date = new Date()): { verifier: string } | null {
  const [nonce, exp, sig] = (state ?? "").split(".");
  if (!nonce || !exp || !sig || !secret || !safeEqual(sign(secret, "state", `${nonce}.${exp}`), sig)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) < now.getTime() / 1000) return null;
  const dot = (cookie ?? "").indexOf(".");
  if (dot < 1) return null;
  const [cNonce, verifier] = [cookie!.slice(0, dot), cookie!.slice(dot + 1)];
  if (!safeEqual(cNonce, nonce) || verifier.length < 43 || verifier.length > 128) return null;
  return { verifier };
}

export function authorizeUrl(env: JobberEnv, state: string, challenge: string): string {
  const u = new URL(JOBBER_AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.clientId);
  u.searchParams.set("redirect_uri", env.redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

// ---- Connect link (callback -> /ads/jobber, where the Komendly account is picked and the free pack starts) ----
export function signConnectToken(connectionId: string, secret: string, now: Date = new Date()): string {
  const body = Buffer.from(JSON.stringify({ c: connectionId, e: Math.floor(now.getTime() / 1000) + CONNECT_TTL_SEC })).toString("base64url");
  return `${body}.${sign(secret, "connect", body)}`;
}
export function verifyConnectToken(t: string | null | undefined, secret: string, now: Date = new Date()): string | null {
  const [body, sig] = (t ?? "").split(".");
  if (!body || !sig || !secret || !safeEqual(sign(secret, "connect", body), sig)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { c?: unknown; e?: unknown };
    return typeof p.c === "string" && p.c && typeof p.e === "number" && p.e >= now.getTime() / 1000 ? p.c : null;
  } catch {
    return null;
  }
}

/** Where the callback sends the browser. UTM params make middleware record the first touch (utm_source=jobber). */
export function connectPath(token: string, opts: { error?: string } = {}): string {
  const q = new URLSearchParams({ c: token, utm_source: "jobber", utm_medium: "app_marketplace", utm_campaign: "connect" });
  if (opts.error) q.set("error", opts.error.slice(0, 200));
  return `/ads/jobber?${q.toString()}`;
}

// ---- Account ids ----
/**
 * Stable key for a Jobber account. GraphQL ids are base64 global ids (`gid://Jobber/Account/123`); webhook payloads carry
 * an encoded account id too. Normalise both to the numeric id when we can, so a connection always matches its webhooks.
 */
export function accountKey(id: string): string {
  const raw = id.trim();
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const gid = decoded.match(/^gid:\/\/Jobber\/Account\/(\d+)$/);
    if (gid) return gid[1]!;
    if (/^\d+$/.test(decoded) && Buffer.from(decoded).toString("base64") === raw) return decoded;
  } catch {
    // not base64
  }
  return raw;
}

// ---- Webhooks ----
export const IDEA_TOPICS = ["JOB_CLOSED", "VISIT_COMPLETE"] as const;
export interface JobberWebhook { topic: string; accountId: string; itemId: string; occurredAt: string | null; appId: string | null }

/** data.webHookEvent (JSON; pre-2022 apps post the same fields form-encoded). Tolerates the old `occuredAt` spelling. */
export function parseWebhook(raw: string): JobberWebhook | null {
  let e: Record<string, unknown> | undefined;
  try {
    e = (JSON.parse(raw) as { data?: { webHookEvent?: Record<string, unknown> } })?.data?.webHookEvent;
  } catch {
    const f = new URLSearchParams(raw);
    const nested = f.get("data");
    if (nested) {
      try {
        e = (JSON.parse(nested) as { webHookEvent?: Record<string, unknown> }).webHookEvent;
      } catch {
        e = undefined;
      }
    }
  }
  if (!e || typeof e.topic !== "string" || typeof e.accountId !== "string") return null;
  const at = e.occurredAt ?? e.occuredAt;
  return { topic: e.topic, accountId: e.accountId, itemId: typeof e.itemId === "string" ? e.itemId : "", occurredAt: typeof at === "string" ? at : null, appId: typeof e.appId === "string" ? e.appId : null };
}

/** JWT `exp` of a Jobber access token (they are JWTs), else now + expires_in, else now + 55 minutes. */
export function tokenExpiry(accessToken: string, expiresIn: number | undefined, now: Date = new Date()): Date {
  try {
    const p = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: number };
    if (typeof p.exp === "number") return new Date(p.exp * 1000);
  } catch {
    // opaque token
  }
  return new Date(now.getTime() + (expiresIn && expiresIn > 0 ? expiresIn : 55 * 60) * 1000);
}

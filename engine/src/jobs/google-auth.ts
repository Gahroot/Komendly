// Google Ads auth for a workspace's connection (engine side). oauth = the customer's encrypted refresh token;
// manager = Komendly's manager account (env read inside googleAdsClient).
import { decryptToken, tokenKey } from "../../../src/lib/ads/meta/core/crypto";
import { googleAdsClient, type GoogleAuth } from "../../../src/lib/ads/google/core/ops";
import type { GoogleAdsClient } from "../../../src/lib/ads/google/core/client";
import type { Db } from "../db";
import { PermanentJobError } from "./context";

/** Accepts both a JSON `{ refreshToken }` payload and a bare token string (whatever the web side sealed). */
export function refreshTokenFromSealed(plain: string): string {
  try {
    const j = JSON.parse(plain) as { refreshToken?: unknown; refresh_token?: unknown };
    const t = j.refreshToken ?? j.refresh_token;
    if (typeof t === "string" && t) return t;
  } catch {
    // not JSON: a bare token
  }
  return plain;
}

export interface WorkspaceGoogle { auth: GoogleAuth; client: GoogleAdsClient; conn: { customerId: string | null; loginCustomerId: string | null; currency: string | null; mode: string } }

export async function workspaceGoogle(db: Db, workspaceId: string, env: NodeJS.ProcessEnv = process.env): Promise<WorkspaceGoogle> {
  const conn = await db.googleAdsConnection.findUnique({ where: { workspaceId } });
  if (!conn) throw new PermanentJobError("Google Ads is not connected");
  let auth: GoogleAuth;
  if (conn.mode === "oauth") {
    if (!conn.encryptedToken) throw new PermanentJobError("Google Ads connection has no token; reconnect");
    auth = { kind: "oauth", refreshToken: refreshTokenFromSealed(decryptToken(conn.encryptedToken, tokenKey(env.ADS_TOKEN_KEY))) };
  } else auth = { kind: "manager" };
  const client = googleAdsClient(auth, auth.kind === "manager" ? undefined : conn.loginCustomerId ?? null, env);
  return { auth, client, conn: { customerId: conn.customerId, loginCustomerId: conn.loginCustomerId, currency: conn.currency, mode: conn.mode } };
}

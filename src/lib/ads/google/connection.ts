// The workspace's Google Ads connection (one row per workspace): load, auth, readiness, errors in plain words.
import type { GoogleAdsConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AdsHttpError } from "@/lib/ads/workspace";
import { decryptToken, encryptToken } from "@/lib/ads/meta/core/crypto";
import { checkReadiness, revokeGoogleToken, type GoogleAuth } from "./core/ops";
import { GoogleAdsApiError, type Readiness, type StoredGoogleToken } from "./core/types";
import { googleTokenKey } from "./config";

export function sealGoogleToken(token: StoredGoogleToken): string {
  return encryptToken(JSON.stringify(token), googleTokenKey());
}

export async function loadGoogleConnection(workspaceId: string): Promise<GoogleAdsConnection | null> {
  return prisma.googleAdsConnection.findUnique({ where: { workspaceId } });
}

export async function requireGoogleConnection(workspaceId: string): Promise<GoogleAdsConnection> {
  const c = await loadGoogleConnection(workspaceId);
  if (!c) throw new AdsHttpError(409, "google_not_connected", "Connect your Google Ads account first.");
  return c;
}

/** Who acts on Google: the customer's own refresh token (oauth) or Komendly's manager account. */
export function authFor(conn: Pick<GoogleAdsConnection, "mode" | "encryptedToken">): GoogleAuth {
  if (conn.mode === "manager") return { kind: "manager" };
  if (!conn.encryptedToken) throw new AdsHttpError(409, "google_reconnect", "Your Google sign-in expired. Please connect again.");
  try {
    const t = JSON.parse(decryptToken(conn.encryptedToken, googleTokenKey())) as StoredGoogleToken;
    return { kind: "oauth", refreshToken: t.refreshToken };
  } catch {
    throw new AdsHttpError(409, "google_reconnect", "Your Google sign-in expired. Please connect again.");
  }
}

/** Google failures as plain sentences for owners (never raw API text). */
export function googleHttpError(e: unknown, fallback: string): AdsHttpError {
  if (e instanceof AdsHttpError) return e;
  if (e instanceof GoogleAdsApiError) {
    if (e.status === 503 || e.codes.includes("not_configured")) return new AdsHttpError(503, "google_not_configured", "Google Ads isn't switched on in Komendly yet. Please try again later.");
    if (e.codes.includes("invalid_customer_id")) return new AdsHttpError(400, "invalid_customer_id", e.message.includes("Komendly") ? e.message : "That account number should be 10 numbers, like 123-456-7890.");
    if (e.codes.includes("no_refresh_token") || e.codes.includes("scope_missing")) return new AdsHttpError(400, e.codes[0]!, e.message);
    if (e.status === 401 || e.status === 403) return new AdsHttpError(409, "google_no_access", "Google says Komendly can't reach that account. Check the account number, or connect again.");
    if (e.status === 429) return new AdsHttpError(429, "rate_limited", "Google is busy right now. Please try again in a minute.");
  }
  console.error("[ads/google]", e);
  return new AdsHttpError(502, "google_failed", fallback);
}

const UNKNOWN: Readiness = { billing: "unknown", account: "unknown", managerLink: "none", canPublish: false, blockers: [] };
const cache = new Map<string, { at: number; key: string; value: Readiness }>();
const READINESS_TTL_MS = 8_000;

/**
 * Live readiness for the picked account, cached a few seconds per workspace (the dialog re-checks every ~10s)
 * and capped at 6s so the status route never hangs on Google. Manager-link status is mirrored into the row.
 */
export async function readinessFor(conn: GoogleAdsConnection, opts: { fresh?: boolean } = {}): Promise<Readiness> {
  if (!conn.customerId) return { ...UNKNOWN, blockers: ["Pick a Google Ads account."] };
  const key = `${conn.mode}:${conn.customerId}:${conn.updatedAt.getTime()}`;
  const hit = cache.get(conn.workspaceId);
  if (!opts.fresh && hit && hit.key === key && Date.now() - hit.at < READINESS_TTL_MS) return hit.value;
  let value: Readiness;
  try {
    value = await Promise.race([
      checkReadiness(authFor(conn), conn.customerId, conn.loginCustomerId ?? undefined),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("readiness timeout")), 6_000)),
    ]);
  } catch {
    value = { ...UNKNOWN, managerLink: (conn.managerLinkStatus as Readiness["managerLink"] | null) ?? "none" };
  }
  cache.set(conn.workspaceId, { at: Date.now(), key, value });
  if (conn.mode === "manager" && value.managerLink !== "none" && value.managerLink !== conn.managerLinkStatus) {
    await prisma.googleAdsConnection.update({ where: { workspaceId: conn.workspaceId }, data: { managerLinkStatus: value.managerLink } }).catch(() => undefined);
  }
  return value;
}

export function forgetReadiness(workspaceId: string): void {
  cache.delete(workspaceId);
}

/** Removes the connection; revokes the customer's own Google grant (oauth). Campaigns stay in their Google Ads. */
export async function disconnectGoogle(workspaceId: string): Promise<void> {
  const conn = await loadGoogleConnection(workspaceId);
  if (conn?.mode === "oauth" && conn.encryptedToken) {
    try {
      const t = JSON.parse(decryptToken(conn.encryptedToken, googleTokenKey())) as StoredGoogleToken;
      await revokeGoogleToken(t.refreshToken);
    } catch {
      // Unreadable or already revoked: still delete below.
    }
  }
  // TODO(google-backend): manager mode should also remove Komendly's customer client link (no core op for it yet).
  await prisma.googleAdsConnection.deleteMany({ where: { workspaceId } });
  await prisma.googleOAuthState.deleteMany({ where: { workspaceId } });
  forgetReadiness(workspaceId);
}

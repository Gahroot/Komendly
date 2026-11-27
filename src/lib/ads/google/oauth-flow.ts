// "Sign in with Google": state + PKCE verifier live in GoogleOAuthState (single use, same user, 10 minutes).
import { prisma } from "@/lib/prisma";
import { AdsHttpError } from "@/lib/ads/workspace";
import { exchangeGoogleCode, googleAuthUrl, randomUrlToken, type GoogleOAuthConfig } from "./core/oauth";
import { GoogleAdsApiError } from "./core/types";
import { OAUTH_STATE_TTL_MS } from "./config";
import { forgetReadiness, sealGoogleToken } from "./connection";

/** Only same-site paths ("/ads/runs/x?y"), never "//evil.com" or absolute URLs. */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.length > 500) return "/ads/app";
  return raw;
}

/** returnTo + ?google=connected|error&reason=... */
export function returnUrl(returnTo: string, result: "connected" | "error", reason?: string): string {
  const u = new URL(safeReturnTo(returnTo), "https://x.invalid");
  u.searchParams.delete("google"); u.searchParams.delete("reason");
  u.searchParams.set("google", result);
  if (reason) u.searchParams.set("reason", reason);
  return `${u.pathname}${u.search}${u.hash}`;
}

export async function startGoogleConnect(o: { config: GoogleOAuthConfig; workspaceId: string; userId: string; returnTo: string }): Promise<string> {
  const state = randomUrlToken();
  const verifier = randomUrlToken(48);
  await prisma.googleOAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.googleOAuthState.create({
    data: { state, workspaceId: o.workspaceId, userId: o.userId, codeVerifier: verifier, returnTo: safeReturnTo(o.returnTo), expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS) },
  });
  return googleAuthUrl(o.config, state, verifier);
}

/** Consumes the state (single use), exchanges the code and stores the encrypted refresh token. Returns where to go back. */
export async function finishGoogleConnect(o: { config: GoogleOAuthConfig; state: string; code: string; userId: string }): Promise<{ returnTo: string }> {
  const row = await prisma.googleOAuthState.findUnique({ where: { state: o.state } });
  if (row) await prisma.googleOAuthState.delete({ where: { state: o.state } });
  if (!row || row.userId !== o.userId || row.expiresAt < new Date()) throw new AdsHttpError(400, "state", "This Google sign-in link expired. Please try again.");
  let ex;
  try {
    ex = await exchangeGoogleCode(o.config, o.code, row.codeVerifier);
  } catch (e) {
    const reason = e instanceof GoogleAdsApiError && e.codes[0] ? e.codes[0] : "exchange";
    throw new AdsHttpError(400, reason, "Google sign-in didn't finish.", { returnTo: row.returnTo });
  }
  const encryptedToken = sealGoogleToken(ex.token);
  // A fresh sign-in replaces any previous connection; the account is picked next.
  const data = { mode: "oauth", encryptedToken, email: ex.email, customerId: null, loginCustomerId: null, accountName: null, currency: null, timeZone: null, managerLinkResource: null, managerLinkStatus: null };
  await prisma.googleAdsConnection.upsert({ where: { workspaceId: row.workspaceId }, create: { workspaceId: row.workspaceId, ...data }, update: data });
  forgetReadiness(row.workspaceId);
  return { returnTo: row.returnTo };
}

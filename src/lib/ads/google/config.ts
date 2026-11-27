// Server-side Google Ads settings. Env is read inside functions (module constants were undefined on Vercel).
import type { JobType } from "@/lib/ads/contracts";
import { AdsHttpError } from "@/lib/ads/workspace";
import { tokenKey } from "@/lib/ads/meta/core/crypto";
import type { GoogleOAuthConfig } from "./core/oauth";

/** OAuth client settings; 503 when "Sign in with Google" isn't configured (never invent keys). */
export function googleOAuthConfig(): GoogleOAuthConfig {
  const { GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REDIRECT_URI } = process.env;
  if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET || !GOOGLE_ADS_REDIRECT_URI) {
    throw new AdsHttpError(503, "google_not_configured", "Google Ads isn't switched on in Komendly yet. Please try again later.");
  }
  return { clientId: GOOGLE_ADS_CLIENT_ID, clientSecret: GOOGLE_ADS_CLIENT_SECRET, redirectUri: GOOGLE_ADS_REDIRECT_URI };
}

export function googleTokenKey(): Buffer {
  return tokenKey(process.env.ADS_TOKEN_KEY);
}

/** Engine job types for Google (in JOB_TYPES, src/lib/ads/contracts.ts). */
export const GOOGLE_JOBS = { publish: "publish_google", activate: "activate_google", sync: "sync_google" } as const satisfies Record<string, JobType>;
export const GOOGLE_JOB_TYPES: JobType[] = Object.values(GOOGLE_JOBS);

/** Status data older than this triggers a background sync_google. */
export const SYNC_STALE_MS = 10 * 60 * 1000;
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Creating accounts under Komendly's manager needs Google's OK (manager with $1,000+ lifetime spend). Off unless GOOGLE_ADS_ALLOW_CREATE=1. */
export function canCreateAccounts(): boolean {
  return process.env.GOOGLE_ADS_ALLOW_CREATE === "1";
}

/** "Sign in with Google" uses a sensitive scope; until Google verifies the app, owners see a warning. */
export function oauthVerified(): boolean {
  return process.env.GOOGLE_ADS_OAUTH_VERIFIED === "1";
}

// Canary customer: pure guards + step plan. The script (scripts/canary.ts) does the HTTP. Test mode only, one fixed account.
export const CANARY_EMAIL = "hello+funnel-test@getkomendly.com";

export type StripeMode = "test" | "live" | "unknown";
/** Stripe Checkout session ids / URLs carry the mode: cs_test_... vs cs_live_... */
export function stripeModeOf(sessionUrlOrId: string): StripeMode {
  if (/cs_test_/.test(sessionUrlOrId)) return "test";
  if (/cs_live_/.test(sessionUrlOrId)) return "live";
  return "unknown";
}

export interface CanaryConfig { baseUrl: string; email: string; password: string | null; testKey: string | null; run: boolean; withPack: boolean }

/** Reasons the canary must refuse to run for real (empty = safe). Dry runs never need any. */
export function refusalReasons(c: CanaryConfig): string[] {
  if (!c.run) return [];
  const r: string[] = [];
  if (c.email.toLowerCase() !== CANARY_EMAIL) r.push(`email must be ${CANARY_EMAIL}`);
  if (!c.password) r.push("CANARY_PASSWORD is not set");
  if (!c.testKey) r.push("STRIPE_TEST_SECRET_KEY is not set (the canary never touches live Stripe)");
  else if (!c.testKey.startsWith("sk_test_")) r.push("STRIPE_TEST_SECRET_KEY must be a test key (sk_test_...)");
  try { new URL(c.baseUrl); } catch { r.push("base URL is invalid"); }
  return r;
}

export interface Step { id: string; what: string; optional?: boolean }
export const CANARY_STEPS = (withPack: boolean): Step[] => [
  { id: "login_or_signup", what: "POST /api/ads/auth/login (sign up first if the account does not exist)" },
  { id: "pack", what: "POST /api/ads/runs for https://example.com and poll /api/ads/runs/<id> until ads are ready (costs a real engine run)", optional: !withPack },
  { id: "unlock_checkout", what: "POST /api/ads-billing/checkout {kind: topup, key: unlock_pack}; the Checkout URL must be a cs_test_ session" },
  { id: "verify_session", what: "GET the session from Stripe's TEST API and check the amount equals the unlock price; the session is then expired (never paid)" },
];

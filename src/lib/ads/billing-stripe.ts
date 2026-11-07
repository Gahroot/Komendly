// Ads Stripe client. Separate from src/lib/stripe.ts (which throws without keys):
// here a missing STRIPE_SECRET_KEY means "billing not configured", never a crash.
import Stripe from "stripe";

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isAdsWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_ADS_WEBHOOK_SECRET);
}

export function getAdsStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { typescript: true }) : null;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3103").replace(/\/$/, "");
}

/** True when a Stripe object (session/subscription/invoice/charge) belongs to the ads product. */
export function isAdsStripeObject(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const meta = (m: unknown) => (m && typeof m === "object" ? (m as Record<string, unknown>).product === "ads" : false);
  if (meta(o.metadata)) return true;
  const parent = o.parent as { subscription_details?: { metadata?: unknown } } | undefined;
  if (meta(parent?.subscription_details?.metadata)) return true;
  const sd = o.subscription_details as { metadata?: unknown } | undefined;
  return meta(sd?.metadata);
}

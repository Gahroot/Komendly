// Pricing-page "Choose <plan>" -> billing page that opens Stripe for that plan (no second plan pick). Pure.
import { isPlanForSale } from "./billing-config";

export function planCheckoutPath(plan: string, yearly: boolean): string {
  return `/ads/billing?plan=${encodeURIComponent(plan)}${yearly ? "&billing=year" : ""}`;
}

/** The plan to auto-open checkout for, or null (unknown/hidden plan, already paid, returning from Stripe, suspended). */
export function autoCheckoutPlan(p: { plan?: string; paid: boolean; checkout?: string; suspended: boolean; configured: boolean }): string | null {
  if (!p.plan || p.paid || p.checkout || p.suspended || !p.configured) return null;
  return isPlanForSale(p.plan) ? p.plan : null;
}

/** Signed-out visitor on /ads/billing: a plan pick means a new buyer, so sign-up (keeping the plan); else sign-in. */
export function signedOutBillingRedirect(plan: string | undefined, yearly: boolean): string {
  return plan && isPlanForSale(plan)
    ? `/ads/signup?next=${encodeURIComponent(planCheckoutPath(plan, yearly))}`
    : `/ads/login?next=${encodeURIComponent(yearly ? "/ads/billing?billing=year" : "/ads/billing")}`;
}

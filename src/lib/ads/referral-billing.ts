// Free month of Starter (3 rewarded referrals): a Stripe subscription with a 30-day trial (card required).
// Helpers used by the checkout route and the ads billing webhook, kept here so the webhook diff stays tiny.
// Credits: the $0 trial-start invoice (billing_reason subscription_create) is paid -> the webhook's normal
// grant gives the 20 Starter credits once (idempotent per invoice id). The first real charge is a
// subscription_cycle invoice, which grants the next 20 and fires paid_converted then.
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { trackAdsEvent } from "./events";
import { FREE_MONTH_TRIAL_DAYS } from "./referrals";

export const FREE_MONTH_KIND = "referral_free_month";

export function isFreeMonthMeta(meta: Stripe.Metadata | null | undefined): boolean {
  return meta?.kind === FREE_MONTH_KIND;
}

/** Checkout params for the free month: trial on the subscription, card always collected. */
export function freeMonthCheckoutParams(): { payment_method_collection: "always"; trialDays: number } {
  return { payment_method_collection: "always", trialDays: FREE_MONTH_TRIAL_DAYS };
}

/** Pure: the $0 invoice that opens a subscription trial (not a payment, not a conversion). */
export function isTrialStartInvoice(inv: Pick<Stripe.Invoice, "billing_reason" | "amount_paid">): boolean {
  return inv.billing_reason === "subscription_create" && inv.amount_paid === 0;
}

/** Subscription status to store after checkout completes. */
export function statusAfterCheckout(meta: Stripe.Metadata | null | undefined): "active" | "trialing" {
  return isFreeMonthMeta(meta) ? "trialing" : "active";
}

/** Once per workspace: marks the free month as used (checked by the checkout route). */
export async function recordFreeMonthClaim(workspaceId: string, userId: string, meta: Stripe.Metadata | null | undefined, ref: string): Promise<void> {
  if (!isFreeMonthMeta(meta)) return;
  const seen = await prisma.adsEvent.findFirst({ where: { name: "referral_free_month_claimed", workspaceId }, select: { id: true } });
  if (!seen) await trackAdsEvent("referral_free_month_claimed", { workspaceId, userId, props: { checkoutSessionId: ref } });
}

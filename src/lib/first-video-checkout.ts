// Server-side: create the Stripe Checkout session for the one-time "First video" offer.
// Eligibility is enforced here (never trust the client). Fulfilment reuses the credit-pack path:
// metadata.type = "credit_purchase" on the PaymentIntent, fulfilled by fulfilCreditPurchase().

import type Stripe from "stripe";
import { komendlyCheckoutText } from "@/lib/checkout-branding";
import { checkFirstVideoEligibility, FIRST_VIDEO_OFFER, type OfferEligibility } from "./first-video-offer";

export interface OfferUser {
  id: string;
  email: string;
  plan: string;
  subscriptionStatus: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

export interface OfferDeps {
  countPurchases(userId: string): Promise<number>;
  saveCustomerId(userId: string, customerId: string): Promise<void>;
  stripe: {
    customers: { create(p: Stripe.CustomerCreateParams): Promise<{ id: string }> };
    checkout: { sessions: { create(p: Stripe.Checkout.SessionCreateParams): Promise<{ id: string; url: string | null }> } };
  };
  /** Optional preconfigured Stripe Price (STRIPE_FIRST_VIDEO_PRICE_ID); inline price_data otherwise. */
  priceId?: string;
}

export type OfferCheckoutResult =
  | { ok: true; url: string | null; sessionId: string }
  | { ok: false; reason: Extract<OfferEligibility, { eligible: false }>["reason"] };

export function firstVideoLineItem(priceId?: string): Stripe.Checkout.SessionCreateParams.LineItem {
  if (priceId) return { price: priceId, quantity: 1 };
  return {
    price_data: {
      currency: "usd",
      unit_amount: FIRST_VIDEO_OFFER.priceCents,
      product_data: { name: `Komendly ${FIRST_VIDEO_OFFER.name}`, description: FIRST_VIDEO_OFFER.description },
    },
    quantity: 1,
  };
}

export async function createFirstVideoCheckout(
  deps: OfferDeps,
  user: OfferUser,
  urls: { origin: string; cancelPath: string },
): Promise<OfferCheckoutResult> {
  const eligibility = checkFirstVideoEligibility({
    plan: user.plan,
    subscriptionStatus: user.subscriptionStatus,
    stripeSubscriptionId: user.stripeSubscriptionId,
    purchaseCount: await deps.countPurchases(user.id),
  });
  if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await deps.stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
    customerId = customer.id;
    await deps.saveCustomerId(user.id, customerId);
  }

  const metadata = { type: "credit_purchase", offer: FIRST_VIDEO_OFFER.key, userId: user.id, minutes: String(FIRST_VIDEO_OFFER.minutes) };
  const session = await deps.stripe.checkout.sessions.create({
    ...komendlyCheckoutText("testimonials"),
    customer: customerId,
    mode: "payment",
    line_items: [firstVideoLineItem(deps.priceId)],
    payment_intent_data: { metadata },
    metadata,
    success_url: `${urls.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&offer=${FIRST_VIDEO_OFFER.key}`,
    cancel_url: `${urls.origin}${urls.cancelPath}`,
    allow_promotion_codes: true,
  });
  return { ok: true, url: session.url, sessionId: session.id };
}

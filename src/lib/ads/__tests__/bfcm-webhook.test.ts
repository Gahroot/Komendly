// BFCM grants through the real ads webhook handler (mocked DB + ledger with stripeRef idempotency): replays grant nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const h = vi.hoisted(() => ({ refs: new Map<string, number>(), updates: [] as unknown[] }));
const grant = (ref: string, delta: number) => {
  if (h.refs.has(ref)) return { applied: false };
  h.refs.set(ref, delta);
  return { applied: true };
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adsWorkspace: { findUnique: vi.fn(async () => ({ id: "w1", ownerId: "u1", stripeCustomerId: "cus_1", subscriptionStatus: "none", adsPlan: "trial" })), update: vi.fn(async (a: unknown) => { h.updates.push(a); return {}; }) },
    adsEvent: { findFirst: vi.fn(async () => ({ id: "e" })) },
    adsRefund: { findFirst: vi.fn(async () => null), upsert: vi.fn(async () => ({})) },
    creditLedger: { findFirst: vi.fn(async () => null) },
  },
}));
vi.mock("../credits", () => ({
  grantSubscriptionCredits: vi.fn(async (_w: string, inv: string, c: number) => grant(inv, c)),
  grantTopup: vi.fn(async (_w: string, ref: string, c: number) => grant(ref, c)),
  refundCredits: vi.fn(async (_w: string, ref: string, c: number) => grant(`refund:${ref}`, -c)),
  grantUnlimitedWeek: vi.fn(), endUnlimitedWeek: vi.fn(), upgradeTopUpCredits: vi.fn(() => 0),
  applyCreditMutation: vi.fn(async (m: { stripeRef: string; delta: number }) => grant(m.stripeRef, m.delta)),
}));
vi.mock("../events", () => ({ trackAdsEvent: vi.fn(async () => undefined) }));
vi.mock("../commissions", () => ({ commissionsForStripeEvent: vi.fn(async () => undefined) }));
vi.mock("../payment-alert", () => ({ adsPaymentAlert: vi.fn(async () => undefined) }));
vi.mock("../referral-billing", () => ({ isTrialStartInvoice: () => false, recordFreeMonthClaim: vi.fn(async () => undefined), statusAfterCheckout: () => "active" }));
vi.mock("@/lib/offer-intel/server", () => ({ recordOfferConversions: vi.fn(async () => undefined) }));
vi.mock("@/lib/growth/checkout-recovery", () => ({ recordCheckoutRecovered: vi.fn(async () => undefined) }));
vi.mock("@/lib/growth/checkout-recovery-server", () => ({ recordCheckoutSession: vi.fn(async () => undefined) }));
vi.mock("@/lib/growth/winback", () => ({ recordWinbackPayment: vi.fn(async () => undefined), recordPaymentFailed: vi.fn(async () => undefined) }));
vi.mock("../team/stop", () => ({ recordTeamHired: vi.fn(async () => undefined), stopTeamFor: vi.fn(async () => undefined) }));
vi.mock("@/lib/hub/plan-testimonials", async (orig) => ({ ...(await orig<typeof import("@/lib/hub/plan-testimonials")>()), grantPlanTestimonials: vi.fn(async () => ({ status: "duplicate" })) }));

import { handleAdsStripeEvent } from "../billing-webhook";
import { BFCM_ANNUAL_BONUS_CREDITS, BFCM_UNLOCK_BONUS_CREDITS } from "../bfcm";
import { UNLOCK_PACK } from "../billing-config";

const ev = (type: string, object: unknown) => ({ type, data: { object } }) as unknown as Stripe.Event;
const unlockSession = { id: "cs_bf", mode: "payment", payment_status: "paid", customer: "cus_1", amount_total: 900, currency: "usd", livemode: false, metadata: { product: "ads", workspaceId: "w1", kind: "topup", topup: "unlock_pack", promo: "bfcm" } };
const annualInvoice = (id: string, reason: string) => ({
  id, billing_reason: reason, amount_paid: 249700, currency: "usd", livemode: false, customer: "cus_1",
  parent: { subscription_details: { subscription: "sub_1", metadata: { product: "ads", workspaceId: "w1", plan: "autopilot", interval: "year", promo: "bfcm" } } },
  lines: { data: [{ amount: 249700, pricing: { price_details: { price: "price_bf_auto" } }, period: { end: 1_830_000_000 } }] },
});

beforeEach(() => {
  h.refs.clear();
  h.updates.length = 0;
  process.env.STRIPE_ADS_BFCM_AUTOPILOT_ANNUAL_PRICE_ID = "price_bf_auto";
});

describe("BFCM webhook grants", () => {
  it("$9 BFCM unlock: pack credits + bonus once, replay grants nothing", async () => {
    await handleAdsStripeEvent(ev("checkout.session.completed", unlockSession));
    await handleAdsStripeEvent(ev("checkout.session.completed", unlockSession));
    expect(h.refs.get("checkout:cs_bf")).toBe(UNLOCK_PACK.credits + BFCM_UNLOCK_BONUS_CREDITS);
    expect(h.refs.size).toBe(1);
  });
  it("full refund of the BFCM unlock claws back all its credits", async () => {
    await handleAdsStripeEvent(ev("charge.refunded", { id: "ch_1", customer: "cus_1", amount: 900, amount_refunded: 900, refunded: true, metadata: unlockSession.metadata, refunds: { data: [{ id: "re_1" }] } }));
    expect(h.refs.get("refund:re_1")).toBe(-(UNLOCK_PACK.credits + BFCM_UNLOCK_BONUS_CREDITS));
  });
  it("BFCM annual autopilot: plan set, 12 months of credits + bonus once, replay-safe, no bonus on renewal", async () => {
    await handleAdsStripeEvent(ev("invoice.paid", annualInvoice("in_1", "subscription_create")));
    await handleAdsStripeEvent(ev("invoice.paid", annualInvoice("in_1", "subscription_create")));
    expect(h.refs.get("in_1")).toBe(1200 * 12);
    expect(h.refs.get("bfcm_bonus:in_1")).toBe(BFCM_ANNUAL_BONUS_CREDITS);
    expect(h.updates.some((u) => (u as { data: { adsPlan?: string } }).data.adsPlan === "autopilot")).toBe(true);
    await handleAdsStripeEvent(ev("invoice.paid", annualInvoice("in_2", "subscription_cycle")));
    expect(h.refs.get("in_2")).toBe(1200 * 12);
    expect(h.refs.has("bfcm_bonus:in_2")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const h = vi.hoisted(() => ({
  refs: new Set<string>(),
  bonus: [] as Array<{ stripeRef: string; delta: number; reason: string }>,
  testi: new Map<string, number>(),
  subUpdates: [] as Array<{ id: string; params: unknown }>,
  userUpdates: [] as unknown[],
  legacySub: "sub_legacy" as string | null,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adsWorkspace: { findUnique: vi.fn(async () => ({ id: "w1", ownerId: "u1", stripeCustomerId: "cus_1", subscriptionStatus: "none", adsPlan: "trial" })), update: vi.fn(async () => ({})) },
    adsEvent: { findFirst: vi.fn(async () => ({ id: "e" })) },
    creditLedger: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ stripeSubscriptionId: h.legacySub })), update: vi.fn(async (a: unknown) => { h.userUpdates.push(a); return {}; }) },
  },
}));
vi.mock("../credits", () => ({
  grantSubscriptionCredits: vi.fn(async () => undefined),
  grantTopup: vi.fn(), refundCredits: vi.fn(), upgradeTopUpCredits: vi.fn(() => 0),
  applyCreditMutation: vi.fn(async (m: { stripeRef: string; delta: number; reason: string }) => {
    if (h.refs.has(m.stripeRef)) return { applied: false };
    h.refs.add(m.stripeRef);
    h.bonus.push(m);
    return { applied: true };
  }),
}));
vi.mock("../events", () => ({ trackAdsEvent: vi.fn(async () => undefined) }));
vi.mock("../commissions", () => ({ commissionsForStripeEvent: vi.fn(async () => undefined) }));
vi.mock("../referral-billing", () => ({ isTrialStartInvoice: () => false, recordFreeMonthClaim: vi.fn(async () => undefined), statusAfterCheckout: () => "active" }));
vi.mock("../billing-stripe", () => ({ getAdsStripe: () => ({ subscriptions: { update: vi.fn(async (id: string, params: unknown) => { h.subUpdates.push({ id, params }); return {}; }) } }) }));
vi.mock("@/lib/hub/plan-testimonials", async (orig) => ({
  ...(await orig<typeof import("@/lib/hub/plan-testimonials")>()),
  grantPlanTestimonials: vi.fn(async (_db: unknown, userId: string, invoiceId: string, minutes: number) => {
    const k = `${userId}:${invoiceId}`;
    if (h.testi.has(k)) return { status: "duplicate" };
    h.testi.set(k, minutes);
    return { status: "granted", granted: minutes, expired: 0 };
  }),
}));

import { handleAdsStripeEvent } from "../billing-webhook";

function invoice(id: string, reason: string, meta: Record<string, string>, amount = 11900): Stripe.Event {
  return { type: "invoice.paid", data: { object: { id, billing_reason: reason, amount_paid: amount, customer: "cus_1", lines: { data: [] }, parent: { subscription_details: { subscription: "sub_1", metadata: { workspaceId: "w1", ...meta } } } } } } as unknown as Stripe.Event;
}

beforeEach(() => {
  h.refs.clear(); h.bonus.length = 0; h.testi.clear(); h.subUpdates.length = 0; h.userUpdates.length = 0; h.legacySub = "sub_legacy";
});

describe("studio launch bonus", () => {
  it("grants 25 offer_bonus credits once, on the first paid invoice only", async () => {
    const ev = invoice("in_1", "subscription_create", { plan: "growth", offer: "studio_launch" });
    await handleAdsStripeEvent(ev);
    await handleAdsStripeEvent(ev); // replay
    await handleAdsStripeEvent(invoice("in_2", "subscription_cycle", { plan: "growth", offer: "studio_launch" }));
    expect(h.bonus).toEqual([expect.objectContaining({ stripeRef: "offer_bonus:in_1", delta: 25, reason: "offer_bonus" })]);
  });
  it("no bonus without the offer or on a $0 invoice", async () => {
    await handleAdsStripeEvent(invoice("in_3", "subscription_create", { plan: "growth" }));
    await handleAdsStripeEvent(invoice("in_4", "subscription_create", { plan: "growth", offer: "studio_launch" }, 0));
    expect(h.bonus).toEqual([]);
  });
});

describe("plan testimonials", () => {
  it("Scale 1, Agency 3 per paid invoice, idempotent; none for Growth", async () => {
    await handleAdsStripeEvent(invoice("in_s", "subscription_create", { plan: "scale" }, 22900));
    await handleAdsStripeEvent(invoice("in_s", "subscription_create", { plan: "scale" }, 22900));
    await handleAdsStripeEvent(invoice("in_a", "subscription_cycle", { plan: "agency" }, 49900));
    await handleAdsStripeEvent(invoice("in_g", "subscription_cycle", { plan: "growth" }));
    expect([...h.testi.entries()]).toEqual([["u1:in_s", 1], ["u1:in_a", 3]]);
  });
  it("annual Scale grants 12", async () => {
    await handleAdsStripeEvent(invoice("in_y", "subscription_create", { plan: "scale", interval: "year" }, 229000));
    expect(h.testi.get("u1:in_y")).toBe(12);
  });
});

describe("legacy switch", () => {
  const checkout = (meta: Record<string, string>): Stripe.Event =>
    ({ type: "checkout.session.completed", data: { object: { id: "cs_1", mode: "subscription", payment_status: "paid", customer: "cus_1", subscription: "sub_new", amount_total: 22900, currency: "usd", metadata: { product: "ads", workspaceId: "w1", kind: "plan", plan: "scale", ...meta } } } }) as unknown as Stripe.Event;
  it("cancels the old testimonial subscription at period end", async () => {
    await handleAdsStripeEvent(checkout({ legacySwitch: "sub_legacy" }));
    expect(h.subUpdates).toEqual([{ id: "sub_legacy", params: { cancel_at_period_end: true, metadata: { switchedTo: "ozzy" } } }]);
    expect(h.userUpdates).toEqual([{ where: { id: "u1" }, data: { cancelAtPeriodEnd: true } }]);
  });
  it("never touches a subscription that isn't the buyer's", async () => {
    h.legacySub = "sub_other";
    await handleAdsStripeEvent(checkout({ legacySwitch: "sub_legacy" }));
    await handleAdsStripeEvent(checkout({}));
    expect(h.subUpdates).toEqual([]);
  });
});

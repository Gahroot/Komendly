import { FIRST_VIDEO_OFFER } from "../first-video-offer";
import { describe, expect, it, vi } from "vitest";
import { createFirstVideoCheckout, firstVideoLineItem, type OfferDeps, type OfferUser } from "../first-video-checkout";

const user: OfferUser = { id: "u1", email: "a@b.co", plan: "pending", subscriptionStatus: "incomplete", stripeSubscriptionId: null, stripeCustomerId: "cus_1" };

function deps(purchases = 0, priceId?: string) {
  const create = vi.fn(async () => ({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }));
  const d: OfferDeps = {
    countPurchases: async () => purchases,
    saveCustomerId: vi.fn(async () => undefined),
    stripe: { customers: { create: vi.fn(async () => ({ id: "cus_new" })) }, checkout: { sessions: { create } } },
    priceId,
  };
  return { d, create };
}
const urls = { origin: "https://komendly.test", cancelPath: "/pricing?canceled=true" };

describe("createFirstVideoCheckout", () => {
  it("creates a one-time session tagged as a credit purchase", async () => {
    const { d, create } = deps();
    const res = await createFirstVideoCheckout(d, user, urls);
    expect(res).toEqual({ ok: true, url: "https://checkout.stripe.test/cs_1", sessionId: "cs_1" });
    const params = create.mock.calls[0]?.[0 as never] as unknown as Record<string, unknown>;
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([firstVideoLineItem()]);
    expect(params.payment_intent_data).toEqual({ metadata: { type: "credit_purchase", offer: "first_video", userId: "u1", minutes: String(FIRST_VIDEO_OFFER.minutes) } });
    expect(String(params.success_url)).toContain("/checkout/success?session_id={CHECKOUT_SESSION_ID}");
  });
  it("uses inline price_data unless a price id is configured", () => {
    expect(firstVideoLineItem()).toMatchObject({ price_data: { unit_amount: FIRST_VIDEO_OFFER.priceCents, currency: "usd" }, quantity: 1 });
    expect(firstVideoLineItem("price_123")).toEqual({ price: "price_123", quantity: 1 });
  });
  it("refuses users who already bought or subscribed, without calling Stripe", async () => {
    const bought = deps(1);
    expect(await createFirstVideoCheckout(bought.d, user, urls)).toEqual({ ok: false, reason: "already_purchased" });
    const sub = deps();
    expect(await createFirstVideoCheckout(sub.d, { ...user, plan: "pro", subscriptionStatus: "active" }, urls)).toEqual({ ok: false, reason: "has_subscription" });
    expect(bought.create).not.toHaveBeenCalled();
    expect(sub.create).not.toHaveBeenCalled();
  });
  it("creates and saves a Stripe customer when missing", async () => {
    const { d } = deps();
    await createFirstVideoCheckout(d, { ...user, stripeCustomerId: null }, urls);
    expect(d.saveCustomerId).toHaveBeenCalledWith("u1", "cus_new");
  });
});

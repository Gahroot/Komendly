// Route-level audit of the money model's server-side rules, with a mocked Stripe client and a mocked DB:
// $9 unlock lands on the unlocked pack; the Growth Autopilot first month ($97) applies the coupon only to a workspace
// with a finished free pack, inside 7 days, once, and while founding spots remain. No real Stripe call is possible.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  adRun: { findFirst: vi.fn() },
  adsEvent: { findFirst: vi.fn() },
  adsWorkspace: { count: vi.fn(), update: vi.fn() },
  creditLedger: { findFirst: vi.fn() },
}));
const stripe = vi.hoisted(() => ({ checkout: { sessions: { create: vi.fn() } }, customers: { create: vi.fn() } }));
const ws = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/ads/billing-stripe", () => ({ getAdsStripe: () => stripe, appUrl: () => "https://www.komendly.com" }));
vi.mock("@/lib/ads/workspace", () => ({
  requireUser: async () => ({ id: "u1", email: "a@b.co" }),
  getOrCreateWorkspace: async () => ws.current,
  adsErrorResponse: (e: unknown) => new Response(String((e as Error)?.stack), { status: 500 }),
}));
vi.mock("@/lib/ads/events", () => ({ trackAdsEvent: vi.fn() }));
vi.mock("@/lib/offer-intel/server", () => ({ recordOfferConversions: vi.fn(), VISITOR_COOKIE: "v" }));
vi.mock("@/lib/ads/trade-server", () => ({ workspaceTrade: async () => null }));
vi.mock("@/lib/ads/referrals", () => ({ referralSummary: async () => ({ freeMonth: "none" }) }));

import { POST } from "@/app/api/ads-billing/checkout/route";

const DAY = 86_400_000;
const post = (body: unknown) => POST(new NextRequest("http://x/api/ads-billing/checkout", { method: "POST", body: JSON.stringify(body) }));
const autopilotLaunch = { kind: "offer", key: "autopilot_launch" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_ADS_AUTOPILOT_PRICE_ID = "price_auto";
  process.env.STRIPE_ADS_AUTOPILOT_LAUNCH_COUPON_ID = "ads_autopilot_first_month_20000";
  process.env.STRIPE_ADS_UNLOCK_PACK_PRICE_ID = "price_unlock";
  ws.current = { id: "w1", name: "W", stripeCustomerId: "cus_1", stripeSubscriptionId: null, subscriptionStatus: "none", suspendedAt: null };
  db.adRun.findFirst.mockResolvedValue({ completedAt: new Date(Date.now() - DAY), id: "run_9" });
  db.adsEvent.findFirst.mockResolvedValue(null); // no prior purchase, no extension
  db.adsWorkspace.count.mockResolvedValue(0);
  stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/x" });
});

describe("$9 unlock", () => {
  it("is a one-time payment that returns to the pack just unlocked", async () => {
    const res = await post({ kind: "topup", key: "unlock_pack", placement: "unlock_pack" });
    if (res.status !== 200) throw new Error(await res.text());
    expect(res.status).toBe(200);
    const p = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(p.mode).toBe("payment");
    expect(p.line_items[0].price).toBe("price_unlock");
    expect(p.success_url).toContain("/ads/runs/run_9");
    expect(p.success_url).toContain("bought=unlock_pack");
  });
});

describe("Growth Autopilot first month (autopilot_launch)", () => {
  it("eligible workspace: $297 price + the $200-off once coupon, back to the team page", async () => {
    const res = await post(autopilotLaunch);
    expect(res.status).toBe(200);
    const p = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(p.mode).toBe("subscription");
    expect(p.line_items[0].price).toBe("price_auto");
    expect(p.discounts).toEqual([{ coupon: "ads_autopilot_first_month_20000" }]);
    expect(p.success_url).toContain("/ads/team");
  });
  it("rejects a workspace whose free pack never finished", async () => {
    db.adRun.findFirst.mockResolvedValue(null);
    const res = await post(autopilotLaunch);
    expect(res.status).toBe(410);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("rejects after the 7-day window", async () => {
    db.adRun.findFirst.mockResolvedValue({ completedAt: new Date(Date.now() - 8 * DAY) });
    expect((await post(autopilotLaunch)).status).toBe(410);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("rejects a second use in the same workspace", async () => {
    db.adsEvent.findFirst.mockImplementation(async (a: { where: { name: string } }) => (a.where.name === "purchased" ? { id: "e1" } : null));
    expect((await post(autopilotLaunch)).status).toBe(410);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("rejects when all 10 founding spots are taken", async () => {
    db.adsWorkspace.count.mockResolvedValue(10);
    const res = await post(autopilotLaunch);
    expect(res.status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("is not sold when the coupon env is missing (never a silent full-price 'first month')", async () => {
    delete process.env.STRIPE_ADS_AUTOPILOT_LAUNCH_COUPON_ID;
    expect((await post(autopilotLaunch)).status).toBe(400);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("the plain autopilot plan never carries the first-month coupon (no bypass by switching kind)", async () => {
    db.adRun.findFirst.mockResolvedValue(null); // ineligible for the launch price
    const res = await post({ kind: "plan", key: "autopilot" });
    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create.mock.calls[0][0].discounts).toBeUndefined();
  });
  it("an existing subscriber cannot start another", async () => {
    ws.current = { ...ws.current, stripeSubscriptionId: "sub_1", subscriptionStatus: "active" };
    expect((await post(autopilotLaunch)).status).toBe(409);
  });
});

describe("BFCM checkout (promo=bfcm)", () => {
  afterEach(() => vi.useRealTimers());
  it("$9 unlock during BFCM: card saved for later (setup_future_usage) and promo in metadata", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-28T18:00:00Z"));
    const res = await post({ kind: "topup", key: "unlock_pack", placement: "bfcm_run", promo: "bfcm" });
    expect(res.status).toBe(200);
    const p = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(p.payment_intent_data.setup_future_usage).toBe("off_session");
    expect(p.payment_intent_data.metadata.promo).toBe("bfcm");
    expect(p.customer).toBe("cus_1");
  });
  it("$9 unlock from a button without promo still gets the BFCM tag during the window (not after)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-28T18:00:00Z"));
    await post({ kind: "topup", key: "unlock_pack", placement: "unlock_pack" });
    expect(stripe.checkout.sessions.create.mock.calls.at(-1)![0].payment_intent_data.metadata.promo).toBe("bfcm");
    vi.setSystemTime(new Date("2026-12-01T09:00:00Z"));
    await post({ kind: "topup", key: "unlock_pack", placement: "unlock_pack" });
    expect(stripe.checkout.sessions.create.mock.calls.at(-1)![0].payment_intent_data.metadata.promo).toBeUndefined();
  });
  it("annual autopilot uses the BFCM price; refused after Mon 30 Nov 23:59:59 PT", async () => {
    process.env.STRIPE_ADS_BFCM_AUTOPILOT_ANNUAL_PRICE_ID = "price_bf_auto";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-01T07:59:00Z"));
    const ok = await post({ kind: "plan", key: "autopilot", interval: "year", promo: "bfcm" });
    expect(ok.status).toBe(200);
    const p = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(p.mode).toBe("subscription");
    expect(p.line_items[0].price).toBe("price_bf_auto");
    expect(p.subscription_data.metadata).toMatchObject({ plan: "autopilot", interval: "year", promo: "bfcm" });
    vi.setSystemTime(new Date("2026-12-01T08:00:00Z"));
    const late = await post({ kind: "plan", key: "autopilot", interval: "year", promo: "bfcm" });
    expect(late.status).toBe(410);
  });
  it("promo=bfcm on something outside the offer is rejected", async () => {
    const res = await post({ kind: "plan", key: "starter", promo: "bfcm" });
    expect(res.status).toBe(400);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  buildRecoveryRows, checkoutFromEvent, checkoutFromSession, checkRecoveryCopy, discountActive, dueStep, fallbackRecoveryCopy, nextStepAt, pickAnchors,
  recordCheckoutRecovered, recoveryCopyContext, recoveryCouponParams, resumePayloadFor, signResumeToken, stopReason, verifyResumeToken,
  type RecoveryState, type StartedCheckout,
} from "../checkout-recovery";
import { ensureRecoveryCoupon, recordCheckoutSession } from "../checkout-recovery-server";
import { signEmailToken, verifyEmailToken } from "@/lib/ads/lifecycle/tokens";

const H = 3_600_000;
const T0 = new Date("2026-11-01T10:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * H);
const co = (o: Partial<StartedCheckout> = {}): StartedCheckout => ({ key: "ev1", billing: "testimonials", userId: "u1", workspaceId: null, item: { kind: "first_video", key: "first_video" }, startedAt: T0, sessionId: "cs_1", ...o });
const st = (o: Partial<RecoveryState> = {}): RecoveryState => ({ checkout: co(), email: "owner@shop.example.com", testUser: false, unsubscribed: false, replied: false, bought: false, sent: [], lastOtherEmailAt: null, ...o });

describe("timing", () => {
  it("first step only after 1h, then 24h / 72h / final", () => {
    expect(dueStep(st(), at(0.5))).toBeNull();
    expect(dueStep(st(), at(1))).toBe("r1_1h");
    const s1 = st({ sent: [{ step: "r1_1h", at: at(1) }] });
    expect(dueStep(s1, at(23))).toBeNull();
    expect(dueStep(s1, at(24))).toBe("r2_24h");
    const s3 = st({ sent: [{ step: "r1_1h", at: at(1) }, { step: "r2_24h", at: at(24) }, { step: "r3_72h", at: at(72) }] });
    expect(dueStep(s3, at(150))).toBeNull();
    expect(dueStep(s3, at(156))).toBe("r4_final");
  });
  it("backfilled checkouts keep the gaps between steps", () => {
    const old = st({ checkout: co({ startedAt: at(-20 * 24) }) });
    expect(dueStep(old, T0)).toBe("r1_1h");
    const s1 = st({ checkout: co({ startedAt: at(-20 * 24) }), sent: [{ step: "r1_1h", at: T0 }] });
    expect(dueStep(s1, at(22))).toBeNull();
    expect(dueStep(s1, at(23))).toBe("r2_24h");
  });
  it("waits 6h after another lifecycle email (exempt from the 24h cap)", () => {
    expect(dueStep(st({ lastOtherEmailAt: at(-2) }), at(1))).toBeNull();
    expect(nextStepAt(st({ lastOtherEmailAt: at(-2) }), at(1))?.at).toEqual(at(4));
  });
  it("starts no new sequence for checkouts older than the backfill window", () => {
    expect(stopReason(st({ checkout: co({ startedAt: at(-31 * 24) }) }), T0, 30)).toBe("too_old");
    expect(stopReason(st({ checkout: co({ startedAt: at(-31 * 24) }), sent: [{ step: "r1_1h", at: at(-1) }] }), T0, 30)).toBeNull();
  });
});

describe("stop rules", () => {
  it.each([
    [{ bought: true }, "bought"],
    [{ unsubscribed: true }, "unsubscribed"],
    [{ replied: true }, "replied"],
    [{ testUser: true }, "test_user"],
    [{ sent: ["r1_1h", "r2_24h", "r3_72h", "r4_final"].map((step) => ({ step, at: T0 })) }, "complete"],
  ] as const)("%o -> %s", (o, why) => {
    expect(stopReason(st(o as Partial<RecoveryState>), at(200))).toBe(why);
    expect(dueStep(st(o as Partial<RecoveryState>), at(200))).toBeNull();
  });

  it("buildRecoveryRows: purchase after start stops; one sequence per user; existing sequence wins", () => {
    const a = co({ key: "a", startedAt: at(0) });
    const b = co({ key: "b", startedAt: at(5) });
    const rows = buildRecoveryRows({
      checkouts: [a, b],
      users: [{ id: "u1", email: "x@shop.example.com", name: "Sam", subscriptionStatus: null }],
      events: [{ name: "recovery_email_sent", userId: "u1", workspaceId: null, props: { checkoutKey: "a", step: "r1_1h" }, createdAt: at(1) }],
      packs: [],
      workspaces: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.checkout.key).toBe("a");
    expect(rows[0]!.state.bought).toBe(false);
    const paid = buildRecoveryRows({ checkouts: [a], users: [{ id: "u1", email: "x@shop.example.com", name: null, subscriptionStatus: null }], events: [], packs: [{ userId: "u1", createdAt: at(3) }], workspaces: [] });
    expect(paid[0]!.state.bought).toBe(true);
    expect(paid[0]!.paidAt).toEqual(at(3));
  });
  it("ads plan checkout stops once the workspace has an active plan; test addresses are skipped", () => {
    const c = co({ billing: "ads", workspaceId: "w1", item: { kind: "plan", key: "starter" } });
    const rows = buildRecoveryRows({ checkouts: [c], users: [{ id: "u1", email: "e2e-1@komendly.com", name: null, subscriptionStatus: null }], events: [], packs: [], workspaces: [{ id: "w1", subscriptionStatus: "active", stripeSubscriptionId: "sub_1" }] });
    expect(rows[0]!.state.bought).toBe(true);
    expect(rows[0]!.state.testUser).toBe(true);
  });
  it("pickAnchors keeps the latest checkout when nothing was sent", () => {
    expect(pickAnchors([co({ key: "a" }), co({ key: "b", startedAt: at(2) })], new Set()).map((c) => c.key)).toEqual(["b"]);
  });
});

describe("selection inputs", () => {
  it("checkoutFromEvent: ads route rows, testimonials rows; skips free month and empty props", () => {
    expect(checkoutFromEvent({ id: "e", userId: "u", workspaceId: "w", props: { kind: "offer", key: "launch_department" }, createdAt: T0 })?.billing).toBe("ads");
    expect(checkoutFromEvent({ id: "e", userId: "u", workspaceId: null, props: { kind: "first_video", key: "first_video", billing: "testimonials" }, createdAt: T0 })?.billing).toBe("testimonials");
    expect(checkoutFromEvent({ id: "e", userId: "u", workspaceId: "w", props: { kind: "free_month", key: "starter" }, createdAt: T0 })).toBeNull();
    expect(checkoutFromEvent({ id: "e", userId: "u", workspaceId: "w", props: {}, createdAt: T0 })).toBeNull();
  });
  it("checkoutFromSession: expired Launch Kit session; skips paid and resumed sessions", () => {
    const x = { id: "cs_1", created: 1_700_000_000, status: "expired", payment_status: "unpaid", amount_total: 9700, metadata: { type: "credit_purchase", offer: "first_video", userId: "u1", minutes: "3" }, customer_details: { email: "a@b.co" } };
    expect(checkoutFromSession(x)).toMatchObject({ billing: "testimonials", userId: "u1", email: "a@b.co", item: { kind: "first_video" } });
    expect(checkoutFromSession({ ...x, status: "complete", payment_status: "paid" })).toBeNull();
    expect(checkoutFromSession({ ...x, metadata: { ...x.metadata, recoveryKey: "ev1" } })).toBeNull();
    expect(checkoutFromSession({ id: "cs_2", created: 1, status: "expired", metadata: { product: "ads", workspaceId: "w1", kind: "offer", plan: "ad_department", offer: "launch_department" } })).toMatchObject({ billing: "ads", workspaceId: "w1", item: { kind: "offer", key: "launch_department" } });
  });
});

describe("resume token", () => {
  const secret = "s3cret";
  it("round-trips, binds user + checkout + item, expires", () => {
    const p = resumePayloadFor(co(), "r2_24h", T0);
    const t = signResumeToken(p, secret);
    expect(verifyResumeToken(t, secret, T0)).toMatchObject({ u: "u1", k: "ev1", i: { kind: "first_video" }, st: "r2_24h" });
    expect(verifyResumeToken(t, "other", T0)).toBeNull();
    expect(verifyResumeToken(t, secret, at(15 * 24))).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), u: "u2" })).toString("base64url");
    expect(verifyResumeToken(`${forged}.${sig}`, secret, T0)).toBeNull();
  });
  it("is domain-separated from lifecycle tokens", () => {
    const life = signEmailToken({ p: "unsub", u: "u1" }, secret);
    expect(verifyResumeToken(life, secret, T0)).toBeNull();
    expect(verifyEmailToken(signResumeToken(resumePayloadFor(co(), "r1_1h", T0), secret), secret)).toBeNull();
  });
  it("discount only on the final step and only for 72h", () => {
    const early = { p: "resume" as const, ...resumePayloadFor(co(), "r3_72h", T0) };
    expect(early.d).toBeUndefined();
    expect(discountActive(early, T0)).toBe(false);
    const last = { p: "resume" as const, ...resumePayloadFor(co(), "r4_final", T0) };
    expect(discountActive(last, at(71))).toBe(true);
    expect(discountActive(last, at(73))).toBe(false);
  });
});

describe("coupon (mocked Stripe)", () => {
  const final = { p: "resume" as const, ...resumePayloadFor(co(), "r4_final", T0) };
  it("20% once, single use, expiring at the discount deadline", () => {
    expect(recoveryCouponParams(final)).toMatchObject({ percent_off: 20, duration: "once", max_redemptions: 1, redeem_by: final.d });
    expect(recoveryCouponParams({ ...final, d: undefined })).toBeNull();
  });
  it("items with their own launch coupon get one combined amount-off coupon ($100 + 20% of $97)", () => {
    const p = recoveryCouponParams({ ...final, i: { kind: "offer", key: "launch_department" } });
    expect(p).toMatchObject({ amount_off: 19700 - 7760, currency: "usd" });
  });
  it("creates once, reuses a valid one, no discount when already redeemed", async () => {
    const params = recoveryCouponParams(final)!;
    const missing = Object.assign(new Error("No such coupon"), { code: "resource_missing" });
    const stripe = { coupons: { retrieve: vi.fn().mockRejectedValueOnce(missing), create: vi.fn().mockResolvedValue({ id: params.id, valid: true }) } };
    expect(await ensureRecoveryCoupon(stripe, params)).toBe(params.id);
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({ id: params.id, percent_off: 20, max_redemptions: 1 }));
    stripe.coupons.retrieve.mockResolvedValueOnce({ id: params.id, valid: true });
    expect(await ensureRecoveryCoupon(stripe, params)).toBe(params.id);
    stripe.coupons.retrieve.mockResolvedValueOnce({ id: params.id, valid: false });
    expect(await ensureRecoveryCoupon(stripe, params)).toBeNull();
    expect(stripe.coupons.create).toHaveBeenCalledTimes(1);
  });
});

function fakeDb(rows: Array<Record<string, unknown>>) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    adsEvent: {
      findFirst: vi.fn(async (a: { where: Record<string, unknown> }) => {
        const w = a.where;
        if (w.name === "recovery_email_sent") return rows.find((r) => r.name === "recovery_email_sent" && r.userId === w.userId && (r.createdAt as Date) >= (w.createdAt as { gte: Date }).gte && (r.createdAt as Date) <= (w.createdAt as { lte: Date }).lte) ?? null;
        const path = (w.props as { path: string[]; equals: string }).path[0]!;
        const eq = (w.props as { equals: string }).equals;
        return [...rows, ...created].find((r) => r.name === w.name && (r.props as Record<string, unknown>)?.[path] === eq) ?? null;
      }),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        created.push(a.data);
        return a.data;
      }),
    },
  };
}

describe("webhook recovery attribution", () => {
  const email = { id: "m1", name: "recovery_email_sent", userId: "u1", workspaceId: null, props: { checkoutKey: "ev1", step: "r2_24h" }, createdAt: at(24) };
  it("records checkout_recovered once per checkout when paid within 14 days of a recovery email", async () => {
    const db = fakeDb([email]);
    expect(await recordCheckoutRecovered(db, { userId: "u1", billing: "testimonials", amountCents: 9700, ref: "pi_1", paidAt: at(30) })).toBe("ev1");
    expect(db.created[0]).toMatchObject({ name: "checkout_recovered", userId: "u1", props: { system: "checkout_recovery", checkoutKey: "ev1", step: "r2_24h", amountCents: 9700, billing: "testimonials" } });
    expect(await recordCheckoutRecovered(db, { userId: "u1", billing: "testimonials", ref: "pi_1", paidAt: at(31) })).toBeNull();
    expect(db.created).toHaveLength(1);
  });
  it("no recovery email (or older than 14 days) = nothing", async () => {
    expect(await recordCheckoutRecovered(fakeDb([]), { userId: "u1", billing: "ads", ref: "cs", paidAt: at(30) })).toBeNull();
    expect(await recordCheckoutRecovered(fakeDb([email]), { userId: "u1", billing: "ads", ref: "cs", paidAt: at(24 + 15 * 24) })).toBeNull();
    expect(await recordCheckoutRecovered(fakeDb([email]), { userId: null, billing: "ads", ref: "cs" })).toBeNull();
  });
  it("expired session webhook records checkout_started once (session id)", async () => {
    const db = fakeDb([]);
    const x = { id: "cs_9", created: 1_700_000_000, status: "expired", metadata: { type: "credit_purchase", offer: "first_video", userId: "u1" } };
    expect(await recordCheckoutSession(db, x, {}, "expired")).toBe(true);
    expect(db.created[0]).toMatchObject({ name: "checkout_started", userId: "u1", props: { kind: "first_video", billing: "testimonials", sessionId: "cs_9", source: "expired" } });
    expect(await recordCheckoutSession(db, x, {}, "expired")).toBe(false);
  });
});

describe("copy", () => {
  const ctx = (step: Parameters<typeof recoveryCopyContext>[1]) => recoveryCopyContext(co(), step, { firstName: "Sam", brandName: null, readyAdCount: 0, headlines: [], now: T0 });
  it("fallback passes its own checks; only the final step offers 20% off", () => {
    for (const s of ["r1_1h", "r2_24h", "r3_72h", "r4_final"] as const) {
      const c = fallbackRecoveryCopy(ctx(s));
      expect(checkRecoveryCopy(c, ctx(s))).toBeNull();
      expect(/20%/.test(c.paragraphs.join(" ") + c.subject)).toBe(s === "r4_final");
    }
    expect(ctx("r4_final").discounted).toBe("$77.60");
  });
  it("rejects invented discounts and prices before the final step", () => {
    const base = fallbackRecoveryCopy(ctx("r2_24h"));
    expect(checkRecoveryCopy({ ...base, paragraphs: [...base.paragraphs, "Take 10% off today."] }, ctx("r2_24h"))).toBe("invented discount");
    expect(checkRecoveryCopy({ ...base, paragraphs: [...base.paragraphs, "Only $49 now."] }, ctx("r2_24h"))).toMatch(/unknown price/);
  });
});

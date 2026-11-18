import { describe, expect, it, vi } from "vitest";
import {
  buildWinbackRows, caseFromEvent, checkWinbackCopy, fallbackWinbackCopy, recordPaymentFailed, recordTestimonialChurn, recordWinbackPayment, signWinbackLink, verifyWinbackLink,
  winbackCopyContext, winbackCouponParams, winbackDiscountActive, winbackDue, winbackLinkFor, winbackStop, WINBACK_STEPS, type WinbackCase, type WinbackState,
} from "../winback";
import { verifyResumeToken } from "../checkout-recovery";
import { ensureRecoveryCoupon } from "../checkout-recovery-server";

const H = 3_600_000;
const T0 = new Date("2026-10-01T10:00:00Z");
const at = (h: number) => new Date(T0.getTime() + h * H);
const wc = (o: Partial<WinbackCase> = {}): WinbackCase => ({ key: "k1", kind: "failed", billing: "ads", userId: "u1", workspaceId: "w1", at: T0, invoiceId: "in_1", plan: "starter", resolved: false, ...o });
const st = (o: Partial<WinbackState> = {}): WinbackState => ({ c: wc(), testUser: false, unsubscribed: false, replied: false, resolved: false, ended: false, sent: [], lastOtherEmailAt: null, ...o });

describe("timing", () => {
  it("failed: 1h, day 3, day 7", () => {
    expect(winbackDue(st(), at(0.5))).toBeNull();
    expect(winbackDue(st(), at(1))).toBe("f1_1h");
    const s1 = st({ sent: [{ step: "f1_1h", at: at(1) }] });
    expect(winbackDue(s1, at(71))).toBeNull();
    expect(winbackDue(s1, at(72))).toBe("f2_d3");
    expect(winbackDue(st({ sent: [{ step: "f1_1h", at: at(1) }, { step: "f2_d3", at: at(72) }] }), at(168))).toBe("f3_d7");
  });
  it("churn: day 3, 14, 30; backfill keeps the gaps; 6h after other email", () => {
    const c = st({ c: wc({ kind: "churn" }) });
    expect(winbackDue(c, at(71))).toBeNull();
    expect(winbackDue(c, at(72))).toBe("c1_d3");
    const late = st({ c: wc({ kind: "churn" }), sent: [{ step: "c1_d3", at: at(400) }] });
    expect(winbackDue(late, at(500))).toBeNull();
    expect(winbackDue(late, at(400 + 264))).toBe("c2_d14");
    expect(winbackDue(st({ c: wc({ kind: "churn" }), lastOtherEmailAt: at(70) }), at(72))).toBeNull();
    expect(WINBACK_STEPS.churn.at(-1)?.afterH).toBe(720);
  });
});

describe("stop rules", () => {
  it.each([[{ resolved: true }, "resolved"], [{ ended: true }, "ended"], [{ unsubscribed: true }, "unsubscribed"], [{ replied: true }, "replied"], [{ testUser: true }, "test_user"]] as const)("%o", (o, why) => {
    expect(winbackStop(st(o as Partial<WinbackState>), at(300))).toBe(why);
  });
  it("too old without sends (backfill 60d)", () => {
    expect(winbackStop(st({ c: wc({ at: at(-61 * 24) }) }), T0, 60)).toBe("too_old");
  });
  const user = { id: "u1", email: "o@shop.example.com", name: "Sam", subscriptionStatus: null };
  it("failed: invoice paid / active again resolves; later churn ends it", () => {
    const base = { users: [user], packs: [], events: [] };
    expect(buildWinbackRows({ ...base, cases: [wc({ resolved: true })], workspaces: [{ id: "w1", subscriptionStatus: "past_due" }] })[0]!.state.resolved).toBe(true);
    expect(buildWinbackRows({ ...base, cases: [wc()], workspaces: [{ id: "w1", subscriptionStatus: "active" }] })[0]!.state.resolved).toBe(true);
    const ended = buildWinbackRows({ ...base, cases: [wc()], workspaces: [{ id: "w1", subscriptionStatus: "canceled" }] })[0]!;
    expect(ended.state.ended).toBe(true);
  });
  it("churn: any purchase after the churn resolves; one sequence per user and kind", () => {
    const rows = buildWinbackRows({ users: [user], packs: [{ userId: "u1", createdAt: at(10) }], events: [], workspaces: [{ id: "w1", subscriptionStatus: "canceled" }], cases: [wc({ kind: "churn" }), wc({ key: "k0", kind: "churn", at: at(-5) })] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.c.key).toBe("k1");
    expect(rows[0]!.state.resolved).toBe(true);
  });
  it("caseFromEvent reads testimonials churn", () => {
    expect(caseFromEvent({ id: "e", name: "churned", userId: "u", workspaceId: null, props: { billing: "testimonials", subscriptionId: "sub" }, createdAt: T0 })).toMatchObject({ kind: "churn", billing: "testimonials" });
    expect(caseFromEvent({ id: "e", name: "churned", userId: null, workspaceId: "w", props: {}, createdAt: T0 })).toBeNull();
  });
});

describe("links + coupon", () => {
  const secret = "s";
  it("signed, bound, expiring, domain-separated", () => {
    const t = signWinbackLink(winbackLinkFor(wc(), "f1_1h", "card", T0), secret);
    expect(verifyWinbackLink(t, secret, T0)).toMatchObject({ a: "card", u: "u1", k: "k1" });
    expect(verifyWinbackLink(t, "x", T0)).toBeNull();
    expect(verifyWinbackLink(t, secret, at(22 * 24))).toBeNull();
    expect(verifyResumeToken(t, secret, T0)).toBeNull();
    expect(verifyWinbackLink(signWinbackLink({ ...winbackLinkFor(wc(), "c1_d3", "reason", T0), r: "bogus" as never }, secret), secret, T0)).toBeNull();
  });
  it("20% only on the final churn step, 72h, single use (mocked Stripe)", async () => {
    const early = { p: "winback" as const, ...winbackLinkFor(wc({ kind: "churn" }), "c2_d14", "resume", T0) };
    expect(winbackDiscountActive(early, T0)).toBe(false);
    const last = { p: "winback" as const, ...winbackLinkFor(wc({ kind: "churn" }), "c3_d30", "resume", T0) };
    expect(winbackDiscountActive(last, at(71))).toBe(true);
    expect(winbackDiscountActive(last, at(73))).toBe(false);
    const params = winbackCouponParams(last)!;
    expect(params).toMatchObject({ percent_off: 20, duration: "once", max_redemptions: 1, redeem_by: last.d });
    const stripe = { coupons: { retrieve: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: "resource_missing" })), create: vi.fn().mockResolvedValue({ id: params.id, valid: true }) } };
    expect(await ensureRecoveryCoupon(stripe, params)).toBe(params.id);
  });
});

function fakeDb(rows: Array<Record<string, unknown>>) {
  const all = [...rows];
  const match = (r: Record<string, unknown>, w: Record<string, unknown>) => {
    if (r.name !== w.name) return false;
    if (w.userId && r.userId !== w.userId) return false;
    if (w.createdAt) { const c = w.createdAt as { gte: Date; lte: Date }; if ((r.createdAt as Date) < c.gte || (r.createdAt as Date) > c.lte) return false; }
    if (w.props) { const p = w.props as { path: string[]; equals: string }; if ((r.props as Record<string, unknown>)?.[p.path[0]!] !== p.equals) return false; }
    return true;
  };
  return {
    all,
    adsEvent: {
      findFirst: vi.fn(async (a: { where: Record<string, unknown> }) => all.filter((r) => match(r, a.where)).at(-1) ?? null),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => { const r = { id: `n${all.length}`, createdAt: new Date(), ...a.data }; all.push(r); return r; }),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => { const r = all.find((x) => x.id === a.where.id)!; Object.assign(r, a.data); return r; }),
    },
  };
}

describe("webhook handling + attribution", () => {
  it("payment_failed once per invoice; testimonial churn once per subscription", async () => {
    const db = fakeDb([]);
    expect(await recordPaymentFailed(db, { userId: "u1", billing: "ads", invoiceId: "in_1" })).toBe(true);
    expect(await recordPaymentFailed(db, { userId: "u1", billing: "ads", invoiceId: "in_1" })).toBe(false);
    expect(await recordTestimonialChurn(db, { userId: "u1", subscriptionId: "sub_1" })).toBe(true);
    expect(await recordTestimonialChurn(db, { userId: "u1", subscriptionId: "sub_1" })).toBe(false);
    expect(db.all.filter((r) => r.name === "churned")[0]).toMatchObject({ props: { billing: "testimonials" } });
  });
  it("failed invoice paid after a winback email -> resolved + payment_recovered once", async () => {
    const db = fakeDb([
      { id: "pf", name: "payment_failed", userId: "u1", props: { invoiceId: "in_1" }, createdAt: at(0) },
      { id: "m", name: "winback_email_sent", userId: "u1", props: { caseKey: "pf", kind: "failed", step: "f1_1h" }, createdAt: at(1) },
    ]);
    expect(await recordWinbackPayment(db, { userId: "u1", billing: "ads", invoiceId: "in_1", amountCents: 4900, ref: "in_1", paidAt: at(5) })).toEqual({ payment: true, winback: false });
    expect(db.all.find((r) => r.id === "pf")!.props).toMatchObject({ resolvedAt: at(5).toISOString() });
    expect(await recordWinbackPayment(db, { userId: "u1", billing: "ads", invoiceId: "in_1", ref: "in_1", paidAt: at(6) })).toEqual({ payment: false, winback: false });
  });
  it("paid without a winback email: resolved but no payment_recovered", async () => {
    const db = fakeDb([{ id: "pf", name: "payment_failed", userId: "u1", props: { invoiceId: "in_1" }, createdAt: at(0) }]);
    expect(await recordWinbackPayment(db, { userId: "u1", billing: "testimonials", invoiceId: "in_1", ref: "in_1", paidAt: at(2) })).toEqual({ payment: false, winback: false });
    expect((db.all[0]!.props as Record<string, unknown>).resolvedAt).toBeTruthy();
  });
  it("churned customer pays within 60 days of a winback email -> winback_recovered once; not after 60 days", async () => {
    const email = { id: "m", name: "winback_email_sent", userId: "u1", props: { caseKey: "ch", kind: "churn", step: "c3_d30" }, createdAt: at(0) };
    const db = fakeDb([email]);
    expect((await recordWinbackPayment(db, { userId: "u1", billing: "ads", ref: "cs_1", paidAt: at(48) })).winback).toBe(true);
    expect((await recordWinbackPayment(db, { userId: "u1", billing: "ads", ref: "cs_2", paidAt: at(50) })).winback).toBe(false);
    expect((await recordWinbackPayment(fakeDb([email]), { userId: "u1", billing: "ads", ref: "cs", paidAt: at(61 * 24) })).winback).toBe(false);
  });
});

describe("copy", () => {
  it("fallbacks pass checks; only the final ads churn step offers 20%", () => {
    for (const kind of ["failed", "churn"] as const) for (const { step } of WINBACK_STEPS[kind]) for (const billing of ["ads", "testimonials"] as const) {
      const ctx = winbackCopyContext(wc({ kind, billing }), step, { firstName: null, brandName: "Acme", readyAdCount: 2, headlines: ["a", "b"] });
      const c = fallbackWinbackCopy(ctx);
      expect(checkWinbackCopy(c, ctx)).toBeNull();
      expect(/20%/.test(c.subject + c.paragraphs.join(" "))).toBe(step === "c3_d30" && billing === "ads");
    }
  });
});

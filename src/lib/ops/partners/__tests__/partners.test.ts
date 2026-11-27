import { describe, expect, it } from "vitest";
import { calculateCommission, clawbackCents, PARTNER_OPS_TERMS, type PartnerFact, type PaymentFact, type ReferralFact } from "../commission";
import { buildStatement } from "../statement";
import { activationEmail, classifyPartner, partnerSupportRoute, thanksDue, topPerformers, type HealthInput } from "../health";

const D = (s: string) => new Date(s + "T00:00:00Z");
const partner: PartnerFact = { id: "p1", userId: "u1", workspaceId: "w1", email: "p@x.com", status: "approved" };
const ref: ReferralFact = { referredWorkspaceId: "w2", referredUserId: "u2", referredEmail: "c@x.com", createdAt: D("2026-09-01") };
const pay = (o: Partial<PaymentFact> = {}): PaymentFact => ({ id: "pay1", workspaceId: "w2", paidAt: D("2026-10-01"), amountCents: 19700, refundedCents: 0, ...o });
const now = D("2026-12-05");

describe("calculateCommission", () => {
  it("20% of a cleared payment", () => expect(calculateCommission(partner, ref, pay(), now)).toMatchObject({ eligible: true, commissionCents: 3940 }));
  it("not before the 30-day refund window clears", () => expect(calculateCommission(partner, ref, pay({ paidAt: D("2026-11-20") }), now).reason).toBe("not_cleared"));
  it("blocks self-referral by workspace, user and email", () => {
    expect(calculateCommission(partner, { ...ref, referredWorkspaceId: "w1" }, pay({ workspaceId: "w1" }), now).reason).toBe("self_referral");
    expect(calculateCommission(partner, { ...ref, referredUserId: "u1" }, pay(), now).reason).toBe("self_referral");
    expect(calculateCommission(partner, { ...ref, referredEmail: "P@X.com" }, pay(), now).reason).toBe("self_referral");
  });
  it("blocks internal and test accounts, unapproved partners", () => {
    expect(calculateCommission(partner, { ...ref, internal: true }, pay(), now).reason).toBe("internal_account");
    expect(calculateCommission(partner, ref, pay({ test: true }), now).reason).toBe("test_payment");
    expect(calculateCommission({ ...partner, status: "applied" }, ref, pay(), now).reason).toBe("partner_not_approved");
  });
  it("12-month window", () => expect(calculateCommission(partner, ref, pay({ paidAt: D("2027-09-01") }), D("2027-12-01")).reason).toBe("outside_window"));
  it("refunded payment earns nothing; partial refund reduces", () => {
    expect(calculateCommission(partner, ref, pay({ refundedCents: 19700 }), now).reason).toBe("refunded");
    expect(calculateCommission(partner, ref, pay({ refundedCents: 9700 }), now).commissionCents).toBe(2000);
  });
  it("clawback is capped at what was paid", () => {
    expect(clawbackCents(3940, pay({ refundedCents: 19700 }))).toBe(3940);
    expect(clawbackCents(1000, pay({ refundedCents: 19700 }))).toBe(1000);
    expect(clawbackCents(3940, pay())).toBe(0);
  });
});

describe("buildStatement", () => {
  const base = { partner: { ...partner, name: "Sam" }, referrals: [ref], now };
  it("counts a payment in the month it clears", () => {
    const s = buildStatement({ ...base, month: "2026-10", payments: [pay({ paidAt: D("2026-09-20") })] });
    expect(s).toMatchObject({ payingCustomers: 1, grossCents: 19700, commissionCents: 3940, status: "below_minimum" });
    expect(buildStatement({ ...base, month: "2026-11", payments: [pay({ paidAt: D("2026-09-20") })] }).commissionCents).toBe(0);
  });
  it("pending owner approval once payable >= minimum; paid only with a reference", () => {
    const pays = [pay({ paidAt: D("2026-09-20") }), pay({ id: "b", paidAt: D("2026-09-21") })];
    const s = buildStatement({ ...base, month: "2026-10", payments: pays });
    expect(s).toMatchObject({ payableCents: 7880, status: "pending_owner_approval" });
    expect(buildStatement({ ...base, month: "2026-10", payments: pays, paid: { reference: "wise-1", amountCents: 7880 } })).toMatchObject({ status: "paid", paymentRef: "wise-1" });
  });
  it("refund after clearing is clawed back in the refund month; payable never negative", () => {
    const p = pay({ paidAt: D("2026-09-20"), refundedCents: 19700, refundedAt: D("2026-11-10") });
    const s = buildStatement({ ...base, month: "2026-11", payments: [p] });
    expect(s.refundsClawedBackCents).toBe(3940);
    expect(s.payableCents).toBe(0);
    expect(buildStatement({ ...base, month: "2026-11", payments: [p], carryoverCents: 3000 }).payableCents).toBe(0);
  });
  it("refund before clearing leaves no commission and no clawback", () => {
    const p = pay({ paidAt: D("2026-09-20"), refundedCents: 19700, refundedAt: D("2026-09-25") });
    const s = buildStatement({ ...base, month: "2026-10", payments: [p] });
    expect(s).toMatchObject({ commissionCents: 0, refundsClawedBackCents: 0, status: "no_activity" });
    expect(s.excluded.refunded).toBe(1);
  });
  it("carryover pushes a small balance over the minimum", () => {
    expect(buildStatement({ ...base, month: "2026-10", payments: [pay({ paidAt: D("2026-09-20") })], carryoverCents: 2000 }).status).toBe("pending_owner_approval");
  });
  it("flags a terms mismatch with the live 30% program", () => {
    const s = buildStatement({ ...base, month: "2026-10", payments: [pay({ paidAt: D("2026-09-20") })], liveCommissionPct: 30, recordedCommissionCents: 5910 });
    expect(s.reconciliation).toMatchObject({ differs: true, opsPct: 20, livePct: 30 });
  });
  it("default terms are the conservative ones", () => expect(PARTNER_OPS_TERMS).toMatchObject({ commissionPct: 20, commissionMonths: 12 }));
});

describe("partner health", () => {
  const h = (o: Partial<HealthInput> = {}): HealthInput => ({ id: "a", name: "Sam Lee", status: "approved", approvedAt: D("2026-10-01"), referralsTotal: 0, lastReferralAt: null, payingCustomers: 0, commissionCents: 0, activationSentAt: null, thanksSentAt: null, ...o });
  it("activation needed after 14 days with no referrals, once", () => {
    expect(classifyPartner(h(), now)).toBe("activation_needed");
    expect(classifyPartner(h({ approvedAt: D("2026-12-01") }), now)).toBe("healthy");
    expect(classifyPartner(h({ activationSentAt: D("2026-11-01") }), now)).toBe("activation_sent");
  });
  it("stalled, top, inactive", () => {
    expect(classifyPartner(h({ referralsTotal: 2, lastReferralAt: D("2026-09-01") }), now)).toBe("stalled");
    const top = h({ id: "t", referralsTotal: 3, payingCustomers: 2, commissionCents: 9000, lastReferralAt: D("2026-12-01") });
    expect(classifyPartner(top, now, topPerformers([top, h()]))).toBe("top");
    expect(classifyPartner(h({ status: "applied" }), now)).toBe("inactive");
  });
  it("thanks cadence", () => { expect(thanksDue(h(), now)).toBe(true); expect(thanksDue(h({ thanksSentAt: D("2026-11-20") }), now)).toBe(false); });
  it("activation email carries link and assets", () => expect(activationEmail("Sam Lee", "https://k.com/r/sam", "https://k.com/partners").text).toContain("https://k.com/r/sam"));
  it("support routes onto existing categories; payouts go to a human", () => {
    expect(partnerSupportRoute("when do I get my payout?")).toMatchObject({ category: "billing", auto: false });
    expect(partnerSupportRoute("where is my referral link and banner")).toMatchObject({ category: "how_to", auto: true });
  });
});

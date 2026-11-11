import { describe, expect, it } from "vitest";
import { addMonthsUtc, amountExclTax, commissionCents, decideCommission, effectiveStatus, nextPayoutDate, payablesCsv, summarizeCommissions, type CommissionInput } from "../commissions";

const d = (s: string) => new Date(s);
const base = (): CommissionInput => ({
  referral: { status: "signed_up", source: "partner", createdAt: d("2026-01-15T00:00:00Z"), codeKind: "partner" },
  partner: { status: "approved", commissionPct: 30, commissionMonths: 12, approvedAt: d("2026-01-01T00:00:00Z") },
  amountCents: 4900,
  paidAt: d("2026-02-15T00:00:00Z"),
});

describe("commission maths", () => {
  it("rounds 30% of the amount", () => {
    expect(commissionCents(4900, 30)).toBe(1470);
    expect(commissionCents(12900, 30)).toBe(3870);
    expect(commissionCents(2900, 30)).toBe(870);
    expect(commissionCents(333, 30)).toBe(100);
  });
  it("adds calendar months, clamping to month end", () => {
    expect(addMonthsUtc(d("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonthsUtc(d("2026-01-15T00:00:00Z"), 12).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
  it("subtracts tax from the paid amount", () => {
    expect(amountExclTax(5880, [{ amount: 980 }])).toBe(4900);
    expect(amountExclTax(4900, null)).toBe(4900);
  });
});

describe("decideCommission", () => {
  it("earns on a partner referral inside the window, payable after 30 days", () => {
    const r = decideCommission(base());
    expect(r).toEqual({ ok: true, commissionCents: 1470, availableAt: d("2026-03-17T00:00:00Z") });
  });
  it("stops after commissionMonths", () => {
    expect(decideCommission({ ...base(), paidAt: d("2027-01-15T00:00:00Z") })).toEqual({ ok: false, reason: "outside_window" });
    expect(decideCommission({ ...base(), paidAt: d("2027-01-14T23:59:59Z") }).ok).toBe(true);
  });
  it("needs an approved partner and a partner referral", () => {
    expect(decideCommission({ ...base(), referral: null })).toEqual({ ok: false, reason: "no_referral" });
    expect(decideCommission({ ...base(), partner: { ...base().partner!, status: "paused" } })).toEqual({ ok: false, reason: "partner_not_approved" });
    const b = base();
    expect(decideCommission({ ...b, referral: { ...b.referral!, status: "rejected" } })).toEqual({ ok: false, reason: "rejected_referral" });
    // customer link from before the partner was approved
    expect(decideCommission({ ...b, referral: { ...b.referral!, source: "link", createdAt: d("2025-12-01T00:00:00Z") }, paidAt: d("2026-01-02T00:00:00Z") })).toEqual({ ok: false, reason: "not_partner_referral" });
    // partner-kind code used after approval counts even if the referral was saved as 'link'
    expect(decideCommission({ ...b, referral: { ...b.referral!, source: "link" } }).ok).toBe(true);
  });
  it("skips zero-amount invoices (free months, 100% coupons)", () => {
    expect(decideCommission({ ...base(), amountCents: 0 })).toEqual({ ok: false, reason: "zero_amount" });
  });
});

describe("status and payouts", () => {
  const now = d("2026-04-10T00:00:00Z");
  it("reads pending as payable once availableAt passes", () => {
    expect(effectiveStatus({ status: "pending", availableAt: d("2026-04-09T00:00:00Z") }, now)).toBe("payable");
    expect(effectiveStatus({ status: "pending", availableAt: d("2026-04-11T00:00:00Z") }, now)).toBe("pending");
    expect(effectiveStatus({ status: "void", availableAt: d("2026-01-01T00:00:00Z") }, now)).toBe("void");
  });
  it("pays on the 1st of next month with a $50 minimum", () => {
    expect(nextPayoutDate(now).toISOString()).toBe("2026-05-01T00:00:00.000Z");
    const rows = [
      { status: "pending", availableAt: d("2026-04-01T00:00:00Z"), commissionCents: 3000 },
      { status: "pending", availableAt: d("2026-04-20T00:00:00Z"), commissionCents: 2500 },
      { status: "pending", availableAt: d("2026-05-20T00:00:00Z"), commissionCents: 1000 },
      { status: "paid", availableAt: d("2026-02-01T00:00:00Z"), commissionCents: 700 },
      { status: "void", availableAt: d("2026-02-01T00:00:00Z"), commissionCents: 400 },
    ];
    const s = summarizeCommissions(rows, now);
    expect(s).toMatchObject({ payableCents: 3000, pendingCents: 3500, paidCents: 700, voidCents: 400, nextPayoutCents: 5500 });
    expect(summarizeCommissions(rows.slice(0, 1), now).nextPayoutCents).toBe(0);
  });
  it("exports payables as CSV, largest first, quoting commas", () => {
    const csv = payablesCsv([
      { partnerId: "p1", name: "Ann", email: "a@x.com", payoutEmail: "a@pay.com", payoutMethod: "paypal", payableCents: 5000, count: 2 },
      { partnerId: "p2", name: "Bo, Ltd", email: "b@x.com", payoutEmail: "b@pay.com", payoutMethod: "wise", payableCents: 14700, count: 10 },
    ]);
    expect(csv).toBe("partner_id,name,email,payout_email,payout_method,amount_usd,commissions\np2,\"Bo, Ltd\",b@x.com,b@pay.com,wise,147.00,10\np1,Ann,a@x.com,a@pay.com,paypal,50.00,2\n");
  });
});

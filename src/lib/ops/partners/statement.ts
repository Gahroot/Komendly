// Monthly partner statement (pure). Accrual rule: a payment counts in the month it CLEARS (paid + 30 days), net of refunds
// made before clearing. A refund after clearing is clawed back in the month the refund happened. Payable = max(0, new
// commission - clawbacks + carryover of unpaid earlier balance); below the minimum payout it carries over. Payout needs the
// owner: status is never "paid" without a recorded reference.
import { calculateCommission, commissionOf, PARTNER_OPS_TERMS, type PartnerFact, type PaymentFact, type ReferralFact, type Terms } from "./commission";

export const STATEMENT_EVENT = "partner_statement";
export type StatementStatus = "no_activity" | "below_minimum" | "pending_owner_approval" | "paid";

export type StatementInput = {
  partner: PartnerFact & { name?: string };
  month: string; // YYYY-MM
  referrals: ReferralFact[];
  payments: PaymentFact[]; // all payments of referred workspaces
  carryoverCents?: number; // unpaid balance of earlier months
  paid?: { reference: string; amountCents: number } | null;
  recordedCommissionCents?: number | null; // what the live program recorded (AdsCommission), for reconciliation
  liveCommissionPct?: number | null;
  now: Date;
  terms?: Terms;
};
export type Statement = {
  partnerId: string; month: string; name: string | null;
  referredSignups: number; payingCustomers: number;
  grossCents: number; refundsClawedBackCents: number; commissionCents: number; carryoverCents: number; payableCents: number;
  status: StatementStatus; paymentRef: string | null; excluded: Record<string, number>;
  reconciliation: { recordedCents: number | null; livePct: number | null; opsPct: number; differs: boolean };
};

const monthOf = (d: Date) => d.toISOString().slice(0, 7);

export function buildStatement(i: StatementInput): Statement {
  const terms = i.terms ?? PARTNER_OPS_TERMS;
  const refByWs = new Map(i.referrals.map((r) => [r.referredWorkspaceId, r]));
  let gross = 0, commission = 0, claw = 0;
  const paying = new Set<string>();
  const excluded: Record<string, number> = {};
  for (const pay of i.payments) {
    const ref = refByWs.get(pay.workspaceId);
    if (!ref) continue;
    const cl = calculateCommission(i.partner, ref, pay, i.now, terms);
    if (monthOf(cl.clearAt) === i.month) {
      if (cl.eligible) { gross += cl.netCents; commission += cl.commissionCents; paying.add(pay.workspaceId); }
      else if (cl.reason !== "not_cleared") excluded[cl.reason] = (excluded[cl.reason] ?? 0) + 1;
    }
    // refund after the payment cleared, made this month: reverse the commission earned on it
    if (pay.refundedAt && monthOf(pay.refundedAt) === i.month && pay.refundedAt >= cl.clearAt && cl.reason !== "self_referral" && cl.reason !== "internal_account" && cl.reason !== "test_payment" && cl.reason !== "partner_not_approved" && cl.reason !== "outside_window") {
      claw += commissionOf(Math.min(pay.refundedCents, pay.amountCents), terms.commissionPct);
    }
  }
  const carry = Math.max(0, i.carryoverCents ?? 0);
  const payable = Math.max(0, commission - claw + carry);
  const status: StatementStatus = i.paid ? "paid" : commission === 0 && claw === 0 && carry === 0 ? "no_activity" : payable < terms.minPayoutCents ? "below_minimum" : "pending_owner_approval";
  const rec = i.recordedCommissionCents ?? null;
  return {
    partnerId: i.partner.id, month: i.month, name: i.partner.name ?? null,
    referredSignups: i.referrals.filter((r) => monthOf(r.createdAt) === i.month && !r.internal).length,
    payingCustomers: paying.size, grossCents: gross, refundsClawedBackCents: claw, commissionCents: commission, carryoverCents: carry, payableCents: payable,
    status, paymentRef: i.paid?.reference ?? null, excluded,
    reconciliation: { recordedCents: rec, livePct: i.liveCommissionPct ?? null, opsPct: terms.commissionPct, differs: (i.liveCommissionPct != null && i.liveCommissionPct !== terms.commissionPct) || (rec !== null && rec !== commission) },
  };
}

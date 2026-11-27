// Partner commission calculator, conservative terms. Pure (no Next/Prisma): copied into the engine image.
// NOTE: the live program (src/lib/ads/partner.ts PARTNER_TERMS) currently pays 30%; these ops terms are the owner-requested
// conservative 20%. Statements show both so the owner can reconcile before any payout. Nothing here moves money.
export const PARTNER_OPS_TERMS = { commissionPct: 20, commissionMonths: 12, clearDays: 30, minPayoutCents: 5000 } as const;
export type Terms = { commissionPct: number; commissionMonths: number; clearDays: number; minPayoutCents: number };

const DAY = 86_400_000;
export type PartnerFact = { id: string; userId: string; workspaceId: string; email?: string | null; status: string };
export type ReferralFact = { referredWorkspaceId: string; referredUserId: string; referredEmail?: string | null; createdAt: Date; internal?: boolean };
export type PaymentFact = { id: string; workspaceId: string; paidAt: Date; amountCents: number; refundedCents: number; refundedAt?: Date | null; test?: boolean };

export type Reason = "ok" | "partner_not_approved" | "self_referral" | "internal_account" | "test_payment" | "outside_window" | "not_cleared" | "refunded" | "zero_amount";
export type CommissionResult = { eligible: boolean; reason: Reason; commissionCents: number; netCents: number; clearAt: Date };

const addMonths = (d: Date, m: number) => { const x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + m); return x; };
export const commissionOf = (netCents: number, pct: number) => Math.max(0, Math.round((netCents * pct) / 100));

export function isSelfReferral(p: PartnerFact, r: ReferralFact): boolean {
  if (r.referredWorkspaceId === p.workspaceId || r.referredUserId === p.userId) return true;
  const a = p.email?.trim().toLowerCase(), b = r.referredEmail?.trim().toLowerCase();
  return !!a && !!b && a === b;
}

/** One payment -> commission. Only cleared (past the refund window), non-refunded, non-test, non-internal, non-self payments earn. */
export function calculateCommission(p: PartnerFact, r: ReferralFact, pay: PaymentFact, now: Date, terms: Terms = PARTNER_OPS_TERMS): CommissionResult {
  const clearAt = new Date(pay.paidAt.getTime() + terms.clearDays * DAY);
  const net = Math.max(0, pay.amountCents - Math.max(0, pay.refundedCents));
  const no = (reason: Reason): CommissionResult => ({ eligible: false, reason, commissionCents: 0, netCents: net, clearAt });
  if (p.status !== "approved") return no("partner_not_approved");
  if (isSelfReferral(p, r)) return no("self_referral");
  if (r.internal) return no("internal_account");
  if (pay.test) return no("test_payment");
  if (pay.amountCents <= 0) return no("zero_amount");
  if (pay.paidAt >= addMonths(r.createdAt, terms.commissionMonths) || pay.paidAt < r.createdAt) return no("outside_window");
  if (now < clearAt) return no("not_cleared");
  if (net <= 0) return no("refunded");
  return { eligible: true, reason: "ok", commissionCents: commissionOf(net, terms.commissionPct), netCents: net, clearAt };
}

/** Commission already paid out that a LATER refund reverses (payment had cleared, refund came after). */
export function clawbackCents(paidCommissionCents: number, pay: PaymentFact, terms: Terms = PARTNER_OPS_TERMS): number {
  if (pay.refundedCents <= 0 || pay.amountCents <= 0) return 0;
  const reversed = commissionOf(Math.min(pay.refundedCents, pay.amountCents), terms.commissionPct);
  return Math.min(Math.max(0, paidCommissionCents), reversed);
}

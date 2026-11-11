// Partner commissions: 30% of what a partner-referred workspace pays, for 12 months after the referral.
// Pure rules first (unit-tested), then thin DB helpers used by the ads billing webhook and the admin.
import type { AdsCommission, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";

const DAY_MS = 24 * 3600 * 1000;
/** Money-back window: a commission becomes payable this long after the payment. */
export const REFUND_WINDOW_DAYS = 30;
/** Payouts are only sent once a partner's payable balance reaches this. */
export const MIN_PAYOUT_CENTS = 5000;

export type CommissionStatus = "pending" | "payable" | "paid" | "void";

export function commissionCents(amountCents: number, pct: number): number {
  return Math.max(0, Math.round((amountCents * pct) / 100));
}

/** Calendar months, clamped to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsUtc(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

export interface CommissionInput {
  referral: { status: string; source: string; createdAt: Date; codeKind: string | null } | null;
  partner: { status: string; commissionPct: number; commissionMonths: number; approvedAt: Date | null } | null;
  amountCents: number;
  paidAt: Date;
}

export type CommissionDecision =
  | { ok: true; commissionCents: number; availableAt: Date }
  | { ok: false; reason: "no_referral" | "not_partner_referral" | "rejected_referral" | "partner_not_approved" | "outside_window" | "zero_amount" };

/**
 * Does this payment earn a commission? Partner referral = source 'partner', or a partner-kind code used after approval
 * (a customer who later became a partner doesn't earn on their earlier, customer-referral sign-ups).
 */
export function decideCommission(input: CommissionInput): CommissionDecision {
  const { referral, partner, amountCents, paidAt } = input;
  if (!referral) return { ok: false, reason: "no_referral" };
  if (referral.status === "rejected") return { ok: false, reason: "rejected_referral" };
  if (!partner || partner.status !== "approved") return { ok: false, reason: "partner_not_approved" };
  const viaPartnerCode = referral.codeKind === "partner" && !!partner.approvedAt && referral.createdAt >= partner.approvedAt;
  if (referral.source !== "partner" && !viaPartnerCode) return { ok: false, reason: "not_partner_referral" };
  if (paidAt >= addMonthsUtc(referral.createdAt, partner.commissionMonths)) return { ok: false, reason: "outside_window" };
  const cents = commissionCents(amountCents, partner.commissionPct);
  if (amountCents <= 0 || cents <= 0) return { ok: false, reason: "zero_amount" };
  return { ok: true, commissionCents: cents, availableAt: new Date(paidAt.getTime() + REFUND_WINDOW_DAYS * DAY_MS) };
}

/** Pending rows whose refund window passed read as payable (no cron needed). */
export function effectiveStatus(c: Pick<AdsCommission, "status" | "availableAt">, now: Date): CommissionStatus {
  if (c.status === "pending" && c.availableAt.getTime() <= now.getTime()) return "payable";
  return c.status === "payable" || c.status === "paid" || c.status === "void" ? c.status : "pending";
}

/** Payouts go out on the 1st of each month (UTC) for everything payable by then. */
export function nextPayoutDate(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export interface CommissionSummary {
  pendingCents: number;
  payableCents: number;
  paidCents: number;
  voidCents: number;
  nextPayoutAt: Date;
  /** What the next payout would be: payable now + pending that clears before the payout date (0 if under the minimum). */
  nextPayoutCents: number;
}

export function summarizeCommissions(rows: readonly Pick<AdsCommission, "status" | "availableAt" | "commissionCents">[], now: Date): CommissionSummary {
  const next = nextPayoutDate(now);
  const s = { pendingCents: 0, payableCents: 0, paidCents: 0, voidCents: 0 };
  let clearsByPayout = 0;
  for (const r of rows) {
    const st = effectiveStatus(r, now);
    s[`${st}Cents`] += r.commissionCents;
    if (st === "pending" && r.availableAt.getTime() <= next.getTime()) clearsByPayout += r.commissionCents;
  }
  const due = s.payableCents + clearsByPayout;
  return { ...s, nextPayoutAt: next, nextPayoutCents: due >= MIN_PAYOUT_CENTS ? due : 0 };
}

/** Amount actually paid, excluding tax (Stripe invoice: amount_paid minus total_taxes). */
export function amountExclTax(amountPaid: number, taxes: readonly { amount: number }[] | null | undefined): number {
  return Math.max(0, amountPaid - (taxes ?? []).reduce((t, x) => t + x.amount, 0));
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface PayableRow {
  partnerId: string;
  name: string;
  email: string;
  payoutEmail: string;
  payoutMethod: string;
  payableCents: number;
  count: number;
}

export function payablesCsv(rows: readonly PayableRow[]): string {
  const head = ["partner_id", "name", "email", "payout_email", "payout_method", "amount_usd", "commissions"];
  const body = [...rows]
    .sort((a, b) => b.payableCents - a.payableCents || a.partnerId.localeCompare(b.partnerId))
    .map((r) => [r.partnerId, r.name, r.email, r.payoutEmail, r.payoutMethod, (r.payableCents / 100).toFixed(2), r.count].map(csvCell).join(","));
  return [head.join(","), ...body].join("\n") + "\n";
}

// ---------- DB ----------

type Db = Pick<PrismaClient, "adsReferral" | "adsReferralCode" | "adsPartner" | "adsCommission">;

export type RecordResult = { recorded: true; commissionId: string } | { recorded: false; reason: string };

/** Create the commission for one payment of `workspaceId`. Idempotent by paymentId (AdsCommission.stripeInvoiceId). */
export async function recordPartnerCommission(
  db: Db,
  p: { workspaceId: string; paymentId: string; amountCents: number; paidAt: Date },
): Promise<RecordResult> {
  const referral = await db.adsReferral.findUnique({ where: { referredWorkspaceId: p.workspaceId } });
  if (!referral) return { recorded: false, reason: "no_referral" };
  const [code, partner] = await Promise.all([
    db.adsReferralCode.findUnique({ where: { code: referral.code }, select: { kind: true } }),
    db.adsPartner.findUnique({ where: { workspaceId: referral.referrerWorkspaceId } }),
  ]);
  const d = decideCommission({ referral: { ...referral, codeKind: code?.kind ?? null }, partner, amountCents: p.amountCents, paidAt: p.paidAt });
  if (!d.ok || !partner) return { recorded: false, reason: d.ok ? "partner_not_approved" : d.reason };
  try {
    const row = await db.adsCommission.create({
      data: {
        partnerId: partner.id,
        referredWorkspaceId: p.workspaceId,
        stripeInvoiceId: p.paymentId,
        amountCents: p.amountCents,
        commissionCents: d.commissionCents,
        availableAt: d.availableAt,
        status: "pending",
      },
    });
    return { recorded: true, commissionId: row.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { recorded: false, reason: "duplicate" };
    throw err;
  }
}

/** Refunded payment: unpaid commissions for it become void. Already-paid ones are left for the admin to settle. */
export async function voidCommissionsForPayments(db: Db, paymentIds: readonly string[], reason: string): Promise<number> {
  const ids = [...new Set(paymentIds.filter(Boolean))];
  if (!ids.length) return 0;
  const res = await db.adsCommission.updateMany({ where: { stripeInvoiceId: { in: ids }, status: { in: ["pending", "payable"] } }, data: { status: "void", voidReason: reason.slice(0, 200) } });
  return res.count;
}

/** Admin payout: every commission payable now (refund window passed) becomes paid with the payout reference. */
export async function markPartnerPaid(db: Db, partnerId: string, payoutRef: string, now: Date): Promise<{ count: number }> {
  const res = await db.adsCommission.updateMany({
    where: { partnerId, OR: [{ status: "payable" }, { status: "pending", availableAt: { lte: now } }] },
    data: { status: "paid", paidAt: now, payoutRef: payoutRef.slice(0, 200) },
  });
  return { count: res.count };
}

/** Billing must never fail because of commissions: log and move on. */
export async function safely<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[ads-commission] ${label} failed`, err);
    return null;
  }
}

/**
 * The single billing-webhook entry point for partner commissions. Never throws.
 * invoice.paid (any plan, incl. agency/annual/Launch Quarter) -> commission keyed by invoice id;
 * paid top-up checkout -> keyed by payment intent; charge.refunded -> void matching unpaid commissions.
 */
export async function commissionsForStripeEvent(event: Stripe.Event): Promise<void> {
  await safely(event.type, async () => {
    const { prisma } = await import("@/lib/prisma");
    const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);
    const wsFor = async (wsId: string | undefined, customer: string | null) => {
      if (wsId) {
        const ws = await prisma.adsWorkspace.findUnique({ where: { id: wsId }, select: { id: true } });
        if (ws) return ws.id;
      }
      return customer ? ((await prisma.adsWorkspace.findUnique({ where: { stripeCustomerId: customer }, select: { id: true } }))?.id ?? null) : null;
    };
    if (event.type === "invoice.paid") {
      const inv = event.data.object;
      if (!inv.id || inv.amount_paid <= 0) return;
      const sub = inv.parent?.subscription_details;
      const ws = await wsFor(sub?.metadata?.workspaceId ?? inv.metadata?.workspaceId, idOf(inv.customer));
      if (!ws) return;
      const paidAt = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : new Date(event.created * 1000);
      await recordPartnerCommission(prisma, { workspaceId: ws, paymentId: inv.id, amountCents: amountExclTax(inv.amount_paid, inv.total_taxes), paidAt });
    } else if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      if (s.metadata?.product !== "ads" || s.mode !== "payment" || s.metadata?.kind !== "topup" || s.payment_status !== "paid") return;
      const ws = await wsFor(s.metadata?.workspaceId, idOf(s.customer));
      if (!ws) return;
      const amount = Math.max(0, (s.amount_total ?? 0) - (s.total_details?.amount_tax ?? 0));
      await recordPartnerCommission(prisma, { workspaceId: ws, paymentId: idOf(s.payment_intent) ?? `checkout:${s.id}`, amountCents: amount, paidAt: new Date(s.created * 1000) });
    } else if (event.type === "charge.refunded") {
      const ch = event.data.object;
      const pi = idOf(ch.payment_intent);
      if (!pi) return;
      const ids = [pi];
      const key = process.env.STRIPE_SECRET_KEY;
      if (key) {
        const { default: StripeCtor } = await import("stripe");
        const payments = await new StripeCtor(key).invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, limit: 5 });
        for (const p of payments.data) {
          const inv = idOf(p.invoice);
          if (inv) ids.push(inv);
        }
      }
      await voidCommissionsForPayments(prisma, ids, `refunded ${ch.amount_refunded}/${ch.amount} cents (${ch.id})`);
    }
  });
}

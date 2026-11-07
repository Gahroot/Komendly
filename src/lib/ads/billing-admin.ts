// Admin billing actions (refunds, credit adjustments). Callers must have verified isAdmin.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAdsStripe } from "./billing-stripe";
import { refundCredits } from "./credits";

export type RefundResult = { ok: true; refundId: string; stripeRefundId: string | null; creditsClawedBack: number } | { ok: false; error: string };

export async function issueAdsRefund(input: {
  workspaceId: string;
  actorId: string;
  amountCents: number;
  credits: number;
  reason?: string;
  viaStripe: boolean;
  chargeId?: string;
}): Promise<RefundResult> {
  const ws = await prisma.adsWorkspace.findUnique({ where: { id: input.workspaceId } });
  if (!ws) return { ok: false, error: "Workspace not found" };
  let stripeRefundId: string | null = null;
  if (input.viaStripe && input.amountCents > 0) {
    const stripe = getAdsStripe();
    if (!stripe) return { ok: false, error: "Stripe is not configured: use a credit-only refund." };
    if (!ws.stripeCustomerId) return { ok: false, error: "Workspace has no Stripe customer." };
    let chargeId = input.chargeId;
    if (!chargeId) {
      const charges = await stripe.charges.list({ customer: ws.stripeCustomerId, limit: 10 });
      chargeId = charges.data.find((c) => c.paid && !c.refunded && c.amount - c.amount_refunded >= input.amountCents)?.id;
    }
    if (!chargeId) return { ok: false, error: "No refundable charge found for that amount." };
    const refund = await stripe.refunds.create(
      { charge: chargeId, amount: input.amountCents, metadata: { product: "ads", workspaceId: ws.id, actorId: input.actorId } },
      { idempotencyKey: `ads-refund:${chargeId}:${input.amountCents}:${input.actorId}:${randomUUID()}` },
    );
    stripeRefundId = refund.id;
  }
  const row = await prisma.adsRefund.create({
    data: { workspaceId: ws.id, stripeRefundId, amountCents: input.viaStripe ? input.amountCents : 0, credits: input.credits, reason: input.reason, actorId: input.actorId },
  });
  const res = input.credits > 0 ? await refundCredits(ws.id, row.id, input.credits, input.actorId) : { delta: 0 };
  if (-res.delta !== input.credits) await prisma.adsRefund.update({ where: { id: row.id }, data: { credits: -res.delta } });
  return { ok: true, refundId: row.id, stripeRefundId, creditsClawedBack: -res.delta };
}

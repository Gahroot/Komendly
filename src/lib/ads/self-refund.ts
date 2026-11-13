// 30-day guarantee, self-serve ("Refund my first payment"): reuses the admin refund path (issueAdsRefund: Stripe
// refund + AdsRefund row + credit clawback clamped at 0), then cancels the subscription. Once per user/email/card.
import type Stripe from "stripe";
import type { AdsWorkspace, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { issueAdsRefund } from "./billing-admin";
import { getAdsStripe } from "./billing-stripe";
import { trackAdsEvent } from "./events";
import { selfRefundEligibility, SELF_REFUND_MESSAGES, type SelfRefundEligibility, type SelfRefundReason } from "./self-refund-rules";

const LIVE = ["active", "trialing", "past_due"];
const norm = (email: string) => email.trim().toLowerCase();

async function priorSelfRefund(userId: string, email: string, cardFingerprint: string | null): Promise<boolean> {
  const or: object[] = [{ userId }, { props: { path: ["email"], equals: norm(email) } }];
  if (cardFingerprint) or.push({ props: { path: ["cardFingerprint"], equals: cardFingerprint } });
  return Boolean(await prisma.adsEvent.findFirst({ where: { name: "self_refund", OR: or }, select: { id: true } }));
}

export async function getSelfRefundEligibility(ws: AdsWorkspace, user: Pick<User, "id" | "email">, now: Date = new Date(), cardFingerprint: string | null = null): Promise<SelfRefundEligibility> {
  const first = await prisma.adsEvent.findFirst({ where: { name: "paid_converted", workspaceId: ws.id }, orderBy: { createdAt: "asc" }, select: { props: true, createdAt: true } });
  const props = (first?.props ?? {}) as { invoiceId?: unknown; amountCents?: unknown };
  const firstPaid = first && typeof props.invoiceId === "string" && typeof props.amountCents === "number" ? { invoiceId: props.invoiceId, amountCents: props.amountCents, at: first.createdAt } : null;
  const [workspaceRefunds, prior] = await Promise.all([prisma.adsRefund.count({ where: { workspaceId: ws.id } }), priorSelfRefund(user.id, user.email, cardFingerprint)]);
  return selfRefundEligibility({ firstPaid, subscriptionLive: Boolean(ws.stripeSubscriptionId) && LIVE.includes(ws.subscriptionStatus), workspaceRefunds, priorSelfRefund: prior, now });
}

/** The charge behind an invoice (Stripe API 2025+: invoice -> invoice payment -> payment intent -> latest charge). */
async function chargeForInvoice(stripe: Stripe, invoiceId: string): Promise<Stripe.Charge | null> {
  const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 5 });
  for (const p of payments.data) {
    const pi = p.payment.payment_intent;
    const piId = typeof pi === "string" ? pi : pi?.id;
    if (piId) {
      const intent = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
      const ch = intent.latest_charge;
      if (ch && typeof ch !== "string") return ch;
    }
    const charge = p.payment.charge;
    if (charge) return typeof charge === "string" ? stripe.charges.retrieve(charge) : charge;
  }
  return null;
}

export type SelfRefundResult = { ok: true; amountCents: number } | { ok: false; error: string };

export async function runSelfRefund(ws: AdsWorkspace, user: Pick<User, "id" | "email">, reason: SelfRefundReason | null): Promise<SelfRefundResult> {
  const pre = await getSelfRefundEligibility(ws, user);
  if (!pre.ok) return { ok: false, error: SELF_REFUND_MESSAGES[pre.reason] };
  const stripe = getAdsStripe();
  if (!stripe || !ws.stripeSubscriptionId) return { ok: false, error: "Refunds aren't available right now. Please try again later." };
  const charge = await chargeForInvoice(stripe, pre.invoiceId);
  if (!charge || !charge.paid || charge.refunded) return { ok: false, error: "We couldn't find that payment. Please try again later." };
  const fingerprint = charge.payment_method_details?.card?.fingerprint ?? null;
  // Second check with the card: one refund per card, even across accounts.
  const withCard = await getSelfRefundEligibility(ws, user, new Date(), fingerprint);
  if (!withCard.ok) return { ok: false, error: SELF_REFUND_MESSAGES[withCard.reason] };
  // Claw back what that invoice granted (plan credits + launch bonus), clamped at 0 by refundCredits.
  const granted = await prisma.creditLedger.aggregate({ where: { workspaceId: ws.id, stripeRef: { in: [pre.invoiceId, `offer_bonus:${pre.invoiceId}`] }, delta: { gt: 0 } }, _sum: { delta: true } });
  const amountCents = charge.amount - charge.amount_refunded;
  const res = await issueAdsRefund({ workspaceId: ws.id, actorId: user.id, amountCents, credits: granted._sum.delta ?? 0, reason: `self_refund${reason ? `: ${reason}` : ""}`, viaStripe: true, chargeId: charge.id });
  if (!res.ok) return { ok: false, error: "The refund didn't go through. Please try again in a minute." };
  await trackAdsEvent("self_refund", { workspaceId: ws.id, userId: user.id, props: { reason, invoiceId: pre.invoiceId, amountCents, email: norm(user.email), cardFingerprint: fingerprint, plan: ws.adsPlan, refundId: res.refundId } });
  // Cancel now; the customer.subscription.deleted webhook records the churn. Mark it here too so the page is right at once.
  await stripe.subscriptions.cancel(ws.stripeSubscriptionId, { prorate: false }).catch(() => null);
  await prisma.adsWorkspace.update({ where: { id: ws.id }, data: { subscriptionStatus: "canceled", canceledAt: new Date() } });
  return { ok: true, amountCents };
}

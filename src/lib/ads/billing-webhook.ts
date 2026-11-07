// Ads Stripe webhook handlers. Every credit effect is idempotent via CreditLedger.stripeRef.
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getPlan, getTopup, planFromPriceId } from "./billing-config";
import { grantSubscriptionCredits, grantTopup, refundCredits } from "./credits";
import { trackAdsEvent } from "./events";

type Meta = Stripe.Metadata | null | undefined;
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

async function findWorkspace(meta: Meta, customer: string | null) {
  const wsId = meta?.workspaceId;
  if (wsId) {
    const ws = await prisma.adsWorkspace.findUnique({ where: { id: wsId } });
    if (ws) return ws;
  }
  return customer ? prisma.adsWorkspace.findUnique({ where: { stripeCustomerId: customer } }) : null;
}

async function onCheckoutCompleted(s: Stripe.Checkout.Session) {
  const ws = await findWorkspace(s.metadata, idOf(s.customer));
  if (!ws) return;
  const customer = idOf(s.customer);
  if (customer && !ws.stripeCustomerId) await prisma.adsWorkspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customer } });
  if (s.mode === "payment" && s.metadata?.kind === "topup" && s.payment_status === "paid") {
    const pack = getTopup(s.metadata.topup ?? "");
    if (pack) await grantTopup(ws.id, `checkout:${s.id}`, pack.credits);
  }
  if (s.mode === "subscription") {
    const plan = getPlan(s.metadata?.plan ?? "");
    await prisma.adsWorkspace.update({
      where: { id: ws.id },
      data: { stripeSubscriptionId: idOf(s.subscription), ...(plan ? { adsPlan: plan.key } : {}), subscriptionStatus: "active", canceledAt: null },
    });
  }
}

function invoicePlanKey(inv: Stripe.Invoice): string | null {
  const meta = inv.parent?.subscription_details?.metadata;
  if (meta?.plan && getPlan(meta.plan)) return meta.plan;
  for (const line of inv.lines?.data ?? []) {
    const price = idOf(line.pricing?.price_details?.price ?? null);
    const plan = price ? planFromPriceId(price) : undefined;
    if (plan) return plan.key;
  }
  return null;
}

async function onInvoicePaid(inv: Stripe.Invoice) {
  const sub = inv.parent?.subscription_details;
  if (!sub || !inv.id) return;
  const ws = await findWorkspace(sub.metadata, idOf(inv.customer));
  const planKey = invoicePlanKey(inv);
  const plan = planKey ? getPlan(planKey) : undefined;
  if (!ws || !plan) return;
  // Credits only on new periods (create/cycle). Mid-period plan changes don't re-grant (see report).
  if (inv.billing_reason === "subscription_create" || inv.billing_reason === "subscription_cycle") {
    await grantSubscriptionCredits(ws.id, inv.id, plan.monthlyCredits);
  }
  const periodEnd = inv.lines?.data?.[0]?.period?.end;
  await prisma.adsWorkspace.update({
    where: { id: ws.id },
    data: {
      adsPlan: plan.key,
      subscriptionStatus: "active",
      stripeSubscriptionId: idOf(sub.subscription),
      ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
    },
  });
  const already = await prisma.adsEvent.findFirst({ where: { name: "paid_converted", workspaceId: ws.id } });
  if (!already) await trackAdsEvent("paid_converted", { workspaceId: ws.id, userId: ws.ownerId, props: { plan: plan.key, invoiceId: inv.id, amountCents: inv.amount_paid } });
}

async function onSubscriptionChanged(sub: Stripe.Subscription, deleted: boolean) {
  const ws = await findWorkspace(sub.metadata, idOf(sub.customer));
  if (!ws) return;
  const status = deleted ? "canceled" : sub.status;
  const price = idOf(sub.items.data[0]?.price ?? null);
  const plan = getPlan(sub.metadata?.plan ?? "") ?? (price ? planFromPriceId(price) : undefined);
  const periodEnd = sub.items.data[0]?.current_period_end;
  const becameCanceled = status === "canceled" && ws.subscriptionStatus !== "canceled";
  await prisma.adsWorkspace.update({
    where: { id: ws.id },
    data: {
      subscriptionStatus: status,
      stripeSubscriptionId: sub.id,
      ...(plan ? { adsPlan: plan.key } : {}),
      ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
      ...(becameCanceled ? { canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : new Date() } : {}),
    },
  });
  if (becameCanceled) {
    await trackAdsEvent("churned", {
      workspaceId: ws.id,
      userId: ws.ownerId,
      props: {
        subscriptionId: sub.id,
        plan: ws.adsPlan,
        reason: sub.cancellation_details?.reason ?? null,
        feedback: sub.cancellation_details?.feedback ?? null,
        comment: sub.cancellation_details?.comment ?? null,
      },
    });
  }
}

async function onChargeRefunded(ch: Stripe.Charge) {
  const ws = await findWorkspace(ch.metadata, idOf(ch.customer));
  if (!ws) return;
  const refundIds = (ch.refunds?.data ?? []).map((r) => r.id);
  const known = await prisma.adsRefund.findFirst({ where: { stripeRefundId: { in: refundIds } } });
  if (known) return; // issued from admin: credits already handled
  const ref = refundIds[0] ?? `${ch.id}:${ch.amount_refunded}`;
  const pack = ch.metadata?.kind === "topup" ? getTopup(ch.metadata.topup ?? "") : undefined;
  const credits = pack && ch.amount > 0 ? Math.round((pack.credits * ch.amount_refunded) / ch.amount) : 0;
  if (credits > 0) await refundCredits(ws.id, ref, credits);
  await prisma.adsRefund.upsert({
    where: { stripeRefundId: ref },
    create: { workspaceId: ws.id, stripeRefundId: ref, amountCents: ch.amount_refunded, credits, reason: "stripe_dashboard", actorId: "stripe" },
    update: {},
  });
}

/** Dispatch a verified Stripe event. Returns false if the event type is ignored. */
export async function handleAdsStripeEvent(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
      if (event.data.object.metadata?.product !== "ads") return false;
      await onCheckoutCompleted(event.data.object);
      return true;
    case "invoice.paid":
      await onInvoicePaid(event.data.object);
      return true;
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await onSubscriptionChanged(event.data.object, event.type === "customer.subscription.deleted");
      return true;
    case "charge.refunded":
      await onChargeRefunded(event.data.object);
      return true;
    default:
      return false;
  }
}

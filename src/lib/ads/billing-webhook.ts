// Ads Stripe webhook handlers. Every credit effect is idempotent via CreditLedger.stripeRef.
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { annualCredits, intervalFromPriceId, getOffer, getPlan, getTopup, offerCreditsFor, UNLOCK_PACK, UNLOCK_PACK_NOTE, offerFromPriceId, planFromPriceId, type AdsLaunchOffer } from "./billing-config";
import { applyCreditMutation, grantSubscriptionCredits, grantTopup, refundCredits, upgradeTopUpCredits } from "./credits";
import { trackAdsEvent } from "./events";
import { getAdsStripe } from "./billing-stripe";
import { commissionsForStripeEvent } from "./commissions";
import { isTrialStartInvoice, recordFreeMonthClaim, statusAfterCheckout } from "./referral-billing";
import { STUDIO_LAUNCH_OFFER } from "@/lib/hub/money-model";
import { grantPlanTestimonials, planTestimonialsFor } from "@/lib/hub/plan-testimonials";


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

/** Saved once per key (Stripe retries webhooks): the AdsEvent row and its Meta CAPI forward. */
async function trackOncePer(name: "purchased" | "renewed", key: "checkoutSessionId" | "invoiceId", data: { workspaceId: string; userId: string; props: Record<string, unknown> }) {
  const id = data.props[key];
  if (typeof id !== "string") return;
  const seen = await prisma.adsEvent.findFirst({ where: { name, workspaceId: data.workspaceId, props: { path: [key], equals: id } }, select: { id: true } });
  if (!seen) await trackAdsEvent(name, data);
}

async function onCheckoutCompleted(s: Stripe.Checkout.Session) {
  const ws = await findWorkspace(s.metadata, idOf(s.customer));
  if (!ws) return;
  // Every paid checkout (plan, Launch Quarter offer, credit pack) = one Meta Purchase, event_id Purchase:<sessionId>.
  if (s.payment_status === "paid") {
    await trackOncePer("purchased", "checkoutSessionId", {
      workspaceId: ws.id,
      userId: ws.ownerId,
      props: { checkoutSessionId: s.id, kind: s.metadata?.kind ?? s.mode, key: s.metadata?.offer ?? s.metadata?.plan ?? s.metadata?.topup, mode: s.mode, amountCents: s.amount_total ?? 0, currency: s.currency ?? "usd" },
    });
  }
  const customer = idOf(s.customer);
  if (customer && !ws.stripeCustomerId) await prisma.adsWorkspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customer } });
  if (s.mode === "payment" && s.metadata?.kind === "topup" && s.payment_status === "paid") {
    const pack = getTopup(s.metadata.topup ?? "");
    // unlock_pack is a topup row too, so bonus-unlock opens the locked bonus ads; its note marks it for the Starter coupon.
    if (pack) await grantTopup(ws.id, `checkout:${s.id}`, pack.credits, pack.key === UNLOCK_PACK.key ? UNLOCK_PACK_NOTE : undefined);
  }
  if (s.mode === "subscription") {
    const plan = getPlan(s.metadata?.plan ?? "");
    await prisma.adsWorkspace.update({
      where: { id: ws.id },
      data: { stripeSubscriptionId: idOf(s.subscription), ...(plan ? { adsPlan: plan.key } : {}), subscriptionStatus: statusAfterCheckout(s.metadata), canceledAt: null },
    });
    await recordFreeMonthClaim(ws.id, ws.ownerId, s.metadata, s.id);
    if (s.metadata?.legacySwitch && s.payment_status === "paid") await endLegacyTestimonialPlan(s.metadata.legacySwitch, ws.ownerId);
  }
}

/** One-click switch: the grandfathered testimonial subscription ends at its period end (no refund, no double plan). Idempotent. */
async function endLegacyTestimonialPlan(subscriptionId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeSubscriptionId: true } });
  if (user?.stripeSubscriptionId !== subscriptionId) return; // only the buyer's own legacy subscription
  const stripe = getAdsStripe();
  if (!stripe) return;
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true, metadata: { switchedTo: "ozzy" } });
  await prisma.user.update({ where: { id: userId }, data: { cancelAtPeriodEnd: true } });
}

// Price ids of the invoice's charge lines (proration credits for the old price are negative: skipped).
// The price is the source of truth: subscription metadata keeps the ORIGINAL plan after a portal switch.
function chargedPrices(inv: Stripe.Invoice): string[] {
  return (inv.lines?.data ?? []).filter((l) => (l.amount ?? 0) >= 0).map((l) => idOf(l.pricing?.price_details?.price ?? null)).filter((p): p is string => Boolean(p));
}

function invoicePlanKey(inv: Stripe.Invoice): string | null {
  for (const price of chargedPrices(inv)) {
    const plan = planFromPriceId(price);
    if (plan) return plan.key;
  }
  const meta = inv.parent?.subscription_details?.metadata;
  return meta?.plan && getPlan(meta.plan) ? meta.plan : null;
}

function invoiceIsAnnual(inv: Stripe.Invoice): boolean {
  const prices = chargedPrices(inv);
  if (prices.some((p) => intervalFromPriceId(p) !== null)) return prices.some((p) => intervalFromPriceId(p) === "year");
  return inv.parent?.subscription_details?.metadata?.interval === "year";
}

function invoiceOffer(inv: Stripe.Invoice): AdsLaunchOffer | undefined {
  const prices = chargedPrices(inv);
  for (const price of prices) {
    const offer = offerFromPriceId(price);
    if (offer) return offer;
  }
  // Metadata only when no plan price is charged (e.g. price ids missing from env); a switched plan wins.
  if (prices.some((p) => planFromPriceId(p))) return undefined;
  return getOffer(inv.parent?.subscription_details?.metadata?.offer ?? "");
}

/** Credits one paid period of this invoice's plan/offer is worth. */
function periodCredits(inv: Stripe.Invoice, plan: { monthlyCredits: number } & Parameters<typeof annualCredits>[0], offer: AdsLaunchOffer | undefined, first: boolean): number {
  return offer ? offerCreditsFor(offer, first) : invoiceIsAnnual(inv) ? annualCredits(plan) : plan.monthlyCredits;
}

async function onInvoicePaid(inv: Stripe.Invoice) {
  const sub = inv.parent?.subscription_details;
  if (!sub || !inv.id) return;
  const ws = await findWorkspace(sub.metadata, idOf(inv.customer));
  const offer = invoiceOffer(inv);
  const planKey = offer?.plan ?? invoicePlanKey(inv);
  const plan = planKey ? getPlan(planKey) : undefined;
  if (!ws || !plan) return;
  // Credits on new periods (create/cycle). stripeRef = invoice id keeps it idempotent.
  // Launch Quarter: 60 credits per quarter, +5 bonus on the first invoice. Annual prepay: all 12 months of credits
  // on each yearly invoice (unused ones expire at the next renewal).
  if (inv.billing_reason === "subscription_create" || inv.billing_reason === "subscription_cycle") {
    await grantSubscriptionCredits(ws.id, inv.id, periodCredits(inv, plan, offer, inv.billing_reason === "subscription_create"));
  } else if (inv.billing_reason === "subscription_update" && inv.amount_paid > 0) {
    // Paid upgrade mid-period (e.g. Starter -> Agency, monthly -> yearly): top up to the new period's credits now.
    const lastGrant = await prisma.creditLedger.findFirst({ where: { workspaceId: ws.id, reason: "subscription_grant" }, orderBy: { createdAt: "desc" }, select: { delta: true } });
    const extra = upgradeTopUpCredits(periodCredits(inv, plan, offer, false), lastGrant?.delta ?? 0);
    if (extra > 0) await applyCreditMutation({ workspaceId: ws.id, reason: "subscription_grant", delta: extra, stripeRef: inv.id, note: `upgrade to ${plan.key} (+${extra})` });
  }
  await grantInvoiceExtras(inv, ws, plan.key, offer);
  const periodEnd = inv.lines?.data?.[0]?.period?.end;
  await prisma.adsWorkspace.update({
    where: { id: ws.id },
    data: {
      adsPlan: plan.key,
      subscriptionStatus: isTrialStartInvoice(inv) ? "trialing" : "active",
      stripeSubscriptionId: idOf(sub.subscription),
      ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
    },
  });
  if (isTrialStartInvoice(inv)) return; // free-month trial: $0, not a conversion yet
  const already = await prisma.adsEvent.findFirst({ where: { name: "paid_converted", workspaceId: ws.id } });
  if (!already) await trackAdsEvent("paid_converted", { workspaceId: ws.id, userId: ws.ownerId, props: { plan: plan.key, ...(offer ? { offer: offer.key } : {}), invoiceId: inv.id, amountCents: inv.amount_paid } });
  else if (inv.billing_reason === "subscription_cycle") await trackOncePer("renewed", "invoiceId", { workspaceId: ws.id, userId: ws.ownerId, props: { plan: plan.key, invoiceId: inv.id, amountCents: inv.amount_paid } });
}

/** Studio launch bonus (first paid invoice) + plan testimonials (every paid period of Scale/Agency). Idempotent per invoice. */
async function grantInvoiceExtras(inv: Stripe.Invoice, ws: { id: string; ownerId: string }, planKey: Parameters<typeof planTestimonialsFor>[0], offer: AdsLaunchOffer | undefined) {
  if (!inv.id || inv.amount_paid <= 0) return; // $0 (free-month trial start) invoices earn nothing extra
  const meta = inv.parent?.subscription_details?.metadata;
  if (inv.billing_reason === "subscription_create" && meta?.offer === STUDIO_LAUNCH_OFFER.key && STUDIO_LAUNCH_OFFER.bonusCredits > 0) {
    await applyCreditMutation({ workspaceId: ws.id, reason: "offer_bonus", delta: STUDIO_LAUNCH_OFFER.bonusCredits, stripeRef: `offer_bonus:${inv.id}`, note: `${STUDIO_LAUNCH_OFFER.name} bonus` });
  }
  const periodic = inv.billing_reason === "subscription_create" || inv.billing_reason === "subscription_cycle" || inv.billing_reason === "subscription_update";
  const minutes = offer ? 0 : planTestimonialsFor(planKey, invoiceIsAnnual(inv));
  if (periodic && minutes > 0) {
    const r = await grantPlanTestimonials(prisma, ws.ownerId, inv.id, minutes);
    if (r.status === "granted") console.log(`[ads-billing] plan testimonials ${planKey}: +${r.granted} (expired ${r.expired}) user ${ws.ownerId} invoice ${inv.id}`);
  }
}

async function onSubscriptionChanged(sub: Stripe.Subscription, deleted: boolean) {
  const ws = await findWorkspace(sub.metadata, idOf(sub.customer));
  if (!ws) return;
  const status = deleted ? "canceled" : sub.status;
  const price = idOf(sub.items.data[0]?.price ?? null);
  // Price first: metadata keeps the original plan after a switch in the Customer Portal.
  const plan = (price ? planFromPriceId(price) : undefined) ?? (price && offerFromPriceId(price) ? undefined : getPlan(sub.metadata?.plan ?? ""));
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
  await commissionsForStripeEvent(event); // partner commissions: wrapped, never throws
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

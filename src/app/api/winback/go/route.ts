// Win-back links (public; signed token bound to user + case, expiring):
//   card   -> Stripe Billing Portal (payment-method update flow) on the right Stripe account
//   reason -> records churn_reason (one-click) and lands on a thank-you page
//   resume -> fresh checkout for their previous ads plan (one-time 20% off on the final step), else /pricing
import { NextRequest, NextResponse } from "next/server";
import { komendlyCheckoutText } from "@/lib/checkout-branding";
import { getPlan, isPlanForSale, priceIdFor } from "@/lib/ads/billing-config";
import { appUrl, getAdsStripe } from "@/lib/ads/billing-stripe";
import { prisma } from "@/lib/prisma";
import { stripe as testimonialsStripe } from "@/lib/stripe";
import { withSystemUtm } from "@/lib/growth/systems";
import { ensureRecoveryCoupon } from "@/lib/growth/checkout-recovery-server";
import type { RecoveryCouponParams } from "@/lib/growth/checkout-recovery";
import { verifyWinbackLink, WINBACK_SYSTEM, winbackCouponParams, winbackDiscountActive, type WinbackLink } from "@/lib/growth/winback";

export const dynamic = "force-dynamic";

const go = (path: string, step = "link_fallback") => NextResponse.redirect(withSystemUtm(`${appUrl()}${path}`, WINBACK_SYSTEM, { campaign: step, medium: "email" }), 303);

export async function GET(request: NextRequest) {
  const p = verifyWinbackLink(request.nextUrl.searchParams.get("t") ?? "", process.env.LIFECYCLE_EMAIL_SECRET ?? "");
  if (!p) return go("/pricing");
  const now = new Date();
  await prisma.adsEvent.create({ data: { name: "winback_clicked", userId: p.u, workspaceId: p.w, props: { system: WINBACK_SYSTEM, action: p.a, step: p.st, caseKey: p.k, billing: p.b } } }).catch(() => undefined);
  try {
    if (p.a === "reason") return await reason(p);
    if (p.a === "card") return await card(p);
    return await resume(p, winbackDiscountActive(p, now));
  } catch (e) {
    console.error("[winback] link failed", e instanceof Error ? e.message : e);
    return go(p.b === "ads" ? "/ads/billing" : "/dashboard/billing", p.st);
  }
}

async function reason(p: WinbackLink) {
  const seen = await prisma.adsEvent.findFirst({ where: { name: "churn_reason", userId: p.u, props: { path: ["caseKey"], equals: p.k } }, select: { id: true } });
  if (!seen) await prisma.adsEvent.create({ data: { name: "churn_reason", userId: p.u, workspaceId: p.w, props: { system: WINBACK_SYSTEM, reason: p.r, caseKey: p.k, billing: p.b } } });
  return go(p.b === "ads" ? "/ads/pricing?feedback=thanks" : "/pricing?feedback=thanks", p.st);
}

async function card(p: WinbackLink) {
  const ret = withSystemUtm(`${appUrl()}${p.b === "ads" ? "/ads/billing" : "/dashboard/billing"}`, WINBACK_SYSTEM, { campaign: p.st, medium: "email" });
  if (p.b === "ads") {
    const stripe = getAdsStripe();
    const ws = p.w ? await prisma.adsWorkspace.findFirst({ where: { id: p.w, ownerId: p.u }, select: { stripeCustomerId: true } }) : null;
    if (!stripe || !ws?.stripeCustomerId) return go("/ads/billing", p.st);
    const s = await stripe.billingPortal.sessions.create({ customer: ws.stripeCustomerId, return_url: ret, flow_data: { type: "payment_method_update" } });
    return NextResponse.redirect(s.url, 303);
  }
  const user = await prisma.user.findUnique({ where: { id: p.u }, select: { stripeCustomerId: true } });
  if (!user?.stripeCustomerId) return go("/dashboard/billing", p.st);
  const s = await testimonialsStripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: ret, flow_data: { type: "payment_method_update" } });
  return NextResponse.redirect(s.url, 303);
}

async function resume(p: WinbackLink, discount: boolean) {
  // Testimonial plans are grandfathered (not sold to new subscriptions): come back via the current plans.
  const plan = p.b === "ads" && p.pl ? getPlan(p.pl) : undefined;
  const stripe = getAdsStripe();
  const priceId = plan && isPlanForSale(plan.key) ? priceIdFor(plan) : null;
  const ws = p.w ? await prisma.adsWorkspace.findFirst({ where: { id: p.w, ownerId: p.u } }) : null;
  if (!stripe || !plan || !priceId || !ws || ws.suspendedAt) return go(p.b === "ads" ? "/ads/pricing" : "/pricing", p.st);
  if (ws.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(ws.subscriptionStatus)) return go("/ads/billing", p.st);
  let customerId = ws.stripeCustomerId;
  if (!customerId) {
    const user = await prisma.user.findUnique({ where: { id: p.u }, select: { email: true } });
    const c = await stripe.customers.create({ email: user?.email, name: ws.name, metadata: { product: "ads", workspaceId: ws.id } });
    customerId = c.id;
    await prisma.adsWorkspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customerId } });
  }
  const coupon = discount ? await ensureRecoveryCoupon(stripe, winbackCouponParams(p) as RecoveryCouponParams | null) : null;
  const metadata = { product: "ads", workspaceId: ws.id, kind: "plan", plan: plan.key, interval: "month", winbackKey: p.k, winbackStep: p.st };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata,
    ...komendlyCheckoutText(plan.usageMultiple ? "founding" : "plan"),
    subscription_data: { metadata },
    ...(coupon ? { discounts: [{ coupon }] } : {}),
    success_url: `${appUrl()}/ads/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/ads/billing?checkout=canceled`,
  });
  return session.url ? NextResponse.redirect(session.url, 303) : go("/ads/billing", p.st);
}

// One-click "resume checkout" from abandoned-checkout recovery emails (public; signed token bound to user + checkout
// + item, expiring). Recreates a fresh Stripe Checkout session for the same item (one-time 20% off on the final step
// while its 72h window is open) and redirects to it. Anything invalid lands on the pricing/billing page instead.
import { NextRequest, NextResponse } from "next/server";
import { komendlyCheckoutText } from "@/lib/checkout-branding";
import { annualPriceIdFor, canBuyUnlimitedWeek, getOffer, getPlan, getTopup, isPlanForSale, offerCouponId, priceIdFor, UNLIMITED_WEEK } from "@/lib/ads/billing-config";
import { appUrl, getAdsStripe } from "@/lib/ads/billing-stripe";
import { prisma } from "@/lib/prisma";
import { stripe as testimonialsStripe } from "@/lib/stripe";
import { findOfferUser, startFirstVideoCheckout } from "@/lib/first-video-server";
import { withSystemUtm } from "@/lib/growth/systems";
import { discountActive, recoveryCouponParams, RECOVERY_SYSTEM, verifyResumeToken, type ResumePayload } from "@/lib/growth/checkout-recovery";
import { ensureRecoveryCoupon } from "@/lib/growth/checkout-recovery-server";

export const dynamic = "force-dynamic";

const PAID = ["active", "trialing", "past_due"];

function go(path: string, step = "resume_fallback") {
  return NextResponse.redirect(withSystemUtm(`${appUrl()}${path}`, RECOVERY_SYSTEM, { campaign: step, medium: "email" }), 303);
}

export async function GET(request: NextRequest) {
  const p = verifyResumeToken(request.nextUrl.searchParams.get("t") ?? "", process.env.LIFECYCLE_EMAIL_SECRET ?? "");
  if (!p) return go("/pricing");
  const now = new Date();
  const discount = discountActive(p, now);
  await prisma.adsEvent
    .create({ data: { name: "recovery_clicked", userId: p.u, workspaceId: p.w, props: { system: RECOVERY_SYSTEM, billing: p.b, step: p.st, checkoutKey: p.k, discount } } })
    .catch(() => undefined);
  try {
    return p.b === "ads" ? await resumeAds(p, discount) : await resumeTestimonials(p, discount);
  } catch (e) {
    console.error("[checkout_recovery] resume failed", e instanceof Error ? e.message : e);
    return go(p.b === "ads" ? "/ads/billing" : "/pricing", p.st);
  }
}

async function resumeAds(p: ResumePayload, discount: boolean) {
  const stripe = getAdsStripe();
  if (!stripe || !p.w) return go("/ads/pricing", p.st);
  // Bound to the token's user: the workspace must be theirs.
  const ws = await prisma.adsWorkspace.findFirst({ where: { id: p.w, ownerId: p.u } });
  const user = await prisma.user.findUnique({ where: { id: p.u }, select: { email: true } });
  if (!ws || !user || ws.suspendedAt) return go("/ads/billing", p.st);
  const { kind, key } = p.i;
  const plan = kind === "plan" ? getPlan(key) : undefined;
  const offer = kind === "offer" ? getOffer(key) : undefined;
  const topup = kind === "topup" ? getTopup(key) : undefined;
  if (kind === "plan" && !isPlanForSale(key)) return go("/ads/pricing", p.st);
  const annual = Boolean(plan) && p.i.interval === "year";
  const priceId = plan ? (annual ? annualPriceIdFor(plan) : priceIdFor(plan)) : offer ? priceIdFor(offer) : topup ? priceIdFor(topup) : null;
  if (!priceId) return go("/ads/pricing", p.st);
  if (topup?.key === UNLIMITED_WEEK.key && !canBuyUnlimitedWeek(ws)) return go("/ads/billing", p.st);
  const recurring = kind !== "topup";
  if (recurring && ws.stripeSubscriptionId && PAID.includes(ws.subscriptionStatus)) return go("/ads/billing", p.st);
  const launchCoupon = offer ? offerCouponId(offer) : null;
  if (offer?.couponEnv && !launchCoupon) return go("/ads/pricing", p.st);
  let customerId = ws.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, name: ws.name, metadata: { product: "ads", workspaceId: ws.id } });
    customerId = customer.id;
    await prisma.adsWorkspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customerId } });
  }
  const coupon = discount ? await ensureRecoveryCoupon(stripe, recoveryCouponParams(p)) : null;
  const metadata: Record<string, string> = {
    product: "ads",
    workspaceId: ws.id,
    kind,
    ...(plan ? { plan: plan.key, interval: annual ? "year" : "month" } : offer ? { plan: offer.plan, offer: offer.key } : { topup: key }),
    recoveryKey: p.k,
    recoveryStep: p.st,
  };
  const founding = (plan?.usageMultiple || (offer && getPlan(offer.plan)?.usageMultiple)) ? true : false;
  const session = await stripe.checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata,
    ...komendlyCheckoutText(founding ? "founding" : recurring ? "plan" : "pack"),
    ...(recurring ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
    ...(coupon ? { discounts: [{ coupon }] } : launchCoupon ? { discounts: [{ coupon: launchCoupon }] } : {}),
    success_url: `${appUrl()}/ads/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/ads/billing?checkout=canceled`,
  });
  return session.url ? NextResponse.redirect(session.url, 303) : go("/ads/billing", p.st);
}

async function resumeTestimonials(p: ResumePayload, discount: boolean) {
  if (p.i.kind !== "first_video") return go("/pricing", p.st);
  const user = await findOfferUser(p.u);
  if (!user) return go("/pricing", p.st);
  const coupon = discount ? await ensureRecoveryCoupon(testimonialsStripe, recoveryCouponParams(p)) : null;
  const r = await startFirstVideoCheckout(user, appUrl(), "/pricing?canceled=true", { coupon, metadata: { recoveryKey: p.k, recoveryStep: p.st } });
  if (!r.ok || !r.url) return go("/dashboard", p.st);
  return NextResponse.redirect(r.url, 303);
}

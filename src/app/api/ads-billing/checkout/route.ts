import { NextRequest, NextResponse } from "next/server";
import { komendlyCheckoutText } from "@/lib/checkout-branding";
import { z } from "zod";
import { annualPriceIdFor, getOffer, getPlan, getTopup, priceIdFor, UNLOCK_PACK, UNLOCK_PACK_NOTE, unlockPackCouponId } from "@/lib/ads/billing-config";
import { getLaunchOfferState } from "@/lib/ads/launch-offer";
import { appUrl, getAdsStripe } from "@/lib/ads/billing-stripe";
import { trackAdsEvent } from "@/lib/ads/events";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import { FREE_MONTH_KIND, freeMonthCheckoutParams } from "@/lib/ads/referral-billing";
import { referralSummary } from "@/lib/ads/referrals";
import { isStudioLaunchOfferOpen, STUDIO_LAUNCH_OFFER } from "@/lib/hub/money-model";
import { isLegacyTestimonialSubscriber } from "@/lib/first-video-offer";

// Studio launch offer: {plan: "growth", offer: "studio_launch"} (or {kind: "plan", key: "growth", offer: "studio_launch"}):
// the existing Growth monthly price + bonus credits on the first invoice (webhook), only inside the 72h window.
const Body = z.preprocess(
  (v) => (v && typeof v === "object" && !("kind" in v) && "plan" in v ? { ...v, kind: "plan", key: (v as { plan: unknown }).plan } : v),
  z.object({
    kind: z.enum(["plan", "topup", "offer", FREE_MONTH_KIND]),
    key: z.string().max(40),
    placement: z.string().max(40).optional(),
    interval: z.enum(["month", "year"]).optional(),
    offer: z.literal(STUDIO_LAUNCH_OFFER.key).optional(),
    /** Grandfathered testimonial subscriber switching to an Ozzy plan: the webhook cancels the old plan at period end. */
    switchFromLegacy: z.boolean().optional(),
  }),
);

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const stripe = getAdsStripe();
    if (!stripe) return NextResponse.json({ error: "Billing is not configured yet.", code: "billing_not_configured" }, { status: 503 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
    const { kind, key, placement } = parsed.data;
    const studioLaunch = parsed.data.offer === STUDIO_LAUNCH_OFFER.key;
    if (studioLaunch && (kind !== "plan" || key !== STUDIO_LAUNCH_OFFER.plan || parsed.data.interval === "year")) {
      return NextResponse.json({ error: "That offer is only for the monthly Growth plan.", code: "invalid" }, { status: 400 });
    }
    const annual = kind === "plan" && parsed.data.interval === "year";
    const freeMonth = kind === FREE_MONTH_KIND;
    const item = kind === "plan" || freeMonth ? getPlan(freeMonth ? "starter" : key) : kind === "offer" ? getOffer(key) : getTopup(key);
    const plan = kind === "plan" ? getPlan(key) : undefined;
    const priceId = annual ? (plan ? annualPriceIdFor(plan) : null) : item ? priceIdFor(item) : null;
    if (!item || !priceId) return NextResponse.json({ error: "That option isn't available.", code: "unknown_price" }, { status: 400 });

    const ws = await getOrCreateWorkspace(user);
    if (ws.suspendedAt) return NextResponse.json({ error: "This workspace is suspended.", code: "suspended" }, { status: 403 });
    if (kind === "offer" && !(await getLaunchOfferState(ws.id)).open) {
      return NextResponse.json({ error: "This launch offer has expired.", code: "offer_expired" }, { status: 410 });
    }
    if (studioLaunch && !isStudioLaunchOfferOpen(ws.studioOfferReadyAt, new Date())) {
      return NextResponse.json({ error: "This launch offer has expired.", code: "offer_expired" }, { status: 410 });
    }
    if (freeMonth && (await referralSummary(user, ws)).freeMonth !== "available") {
      return NextResponse.json({ error: "Your free month isn't available on this account.", code: "free_month_unavailable" }, { status: 409 });
    }
    const recurring = kind !== "topup";
    if (recurring && ws.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(ws.subscriptionStatus)) {
      return NextResponse.json({ error: "You already have a plan. Use Manage subscription to change it.", code: "has_subscription" }, { status: 409 });
    }
    let customerId = ws.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: ws.name, metadata: { product: "ads", workspaceId: ws.id } });
      customerId = customer.id;
      await prisma.adsWorkspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customerId } });
    }
    const legacySwitch = kind === "plan" && parsed.data.switchFromLegacy && isLegacyTestimonialSubscriber(user) ? user.stripeSubscriptionId : null;
    const offer = kind === "offer" ? getOffer(key) : undefined;
    // $9 unlock_pack credited off the first Starter month: only for buyers of the pack who never subscribed.
    const couponId = kind === "plan" && key === "starter" && !annual && !studioLaunch && !legacySwitch ? unlockPackCouponId() : null;
    const unlockCredit = couponId && !ws.stripeSubscriptionId
      ? Boolean(await prisma.creditLedger.findFirst({ where: { workspaceId: ws.id, reason: "topup", note: UNLOCK_PACK_NOTE, delta: { gt: 0 } }, select: { id: true } }))
      : false;
    const metadata = { product: "ads", workspaceId: ws.id, kind, ...(kind === "plan" || freeMonth ? { plan: freeMonth ? "starter" : key, interval: annual ? "year" : "month", ...(studioLaunch ? { offer: STUDIO_LAUNCH_OFFER.key } : {}), ...(legacySwitch ? { legacySwitch } : {}) } : offer ? { plan: offer.plan, offer: offer.key } : { topup: key }) };
    const session = await stripe.checkout.sessions.create({
      mode: recurring ? "subscription" : "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      ...komendlyCheckoutText(recurring ? "plan" : "pack"),
      ...(recurring
        ? { subscription_data: { metadata, ...(freeMonth ? { trial_period_days: freeMonthCheckoutParams().trialDays } : {}) } }
        : { payment_intent_data: { metadata } }),
      ...(unlockCredit && couponId ? { discounts: [{ coupon: couponId }] } : {}),
      ...(freeMonth ? { payment_method_collection: freeMonthCheckoutParams().payment_method_collection } : {}),
      success_url: `${appUrl()}/ads/billing?checkout=success${kind === "topup" && key === UNLOCK_PACK.key ? `&bought=${UNLOCK_PACK.key}` : ""}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/ads/billing?checkout=canceled${kind === "topup" || freeMonth ? "" : `&declined=${encodeURIComponent(key)}`}`,
    });
    await trackAdsEvent("checkout_started", { workspaceId: ws.id, userId: user.id, props: { kind, key, ...(studioLaunch ? { offer: STUDIO_LAUNCH_OFFER.key, app: "studio", amountCents: item.priceCents, currency: "USD" } : {}), ...(annual ? { interval: "year" } : {}), ...(placement ? { placement } : {}), ...(unlockCredit ? { coupon: "unlock_pack_credit" } : {}) } });
    if (studioLaunch) await trackAdsEvent("studio_checkout_started", { workspaceId: ws.id, userId: user.id, props: { offer: STUDIO_LAUNCH_OFFER.key, plan: key, amountCents: item.priceCents } });
    const downsell = placement === "downsell" || placement === "unlock_pack";
    if (kind === "offer" || studioLaunch || (placement && !downsell)) await trackAdsEvent("upsell_accepted", { workspaceId: ws.id, userId: user.id, props: { kind, key, ...(placement ? { placement } : {}) } });
    if (downsell) await trackAdsEvent("downsell_accepted", { workspaceId: ws.id, userId: user.id, props: { kind, key, ...(placement ? { placement } : {}) } });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

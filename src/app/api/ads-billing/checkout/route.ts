import { NextRequest, NextResponse } from "next/server";
import { komendlyCheckoutText } from "@/lib/checkout-branding";
import { z } from "zod";
import { annualPriceIdFor, AUTOPILOT_FULL_MESSAGE, AUTOPILOT_LAUNCH, canBuyUnlimitedWeek, UNLIMITED_WEEK, getOffer, getPlan, isPlanForSale, LAUNCH_QUARTER, offerCouponId, getTopup, priceIdFor, UNLOCK_PACK, UNLOCK_PACK_NOTE, unlockPackCouponId } from "@/lib/ads/billing-config";
import { getLaunchOfferState } from "@/lib/ads/launch-offer";
import { getAutopilotLaunchState } from "@/lib/ads/autopilot-launch";
import { appUrl, getAdsStripe } from "@/lib/ads/billing-stripe";
import { trackAdsEvent } from "@/lib/ads/events";
import { recordOfferConversions, VISITOR_COOKIE } from "@/lib/offer-intel/server";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";
import { FREE_MONTH_KIND, freeMonthCheckoutParams } from "@/lib/ads/referral-billing";
import { referralSummary } from "@/lib/ads/referrals";
import { isStudioLaunchOfferOpen, STUDIO_LAUNCH_OFFER } from "@/lib/hub/money-model";
import { isLegacyTestimonialSubscriber } from "@/lib/first-video-offer";
import { hiresTeam } from "@/lib/ads/team/rules";
import { foundingSpotsLeft } from "@/lib/ads/founding-spots";
import { workspaceTrade } from "@/lib/ads/trade-server";
import { BFCM_ENDED_LINE, BFCM_PROMO, isBfcmActive } from "@/lib/ads/bfcm";
import { bfcmAnnualFor } from "@/lib/ads/billing-config";

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
    /** Black Friday to Cyber Monday: the $9 unlock with bonus credits, or a BFCM annual price. Server-checked deadline. */
    promo: z.literal(BFCM_PROMO).optional(),
  }),
);

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const stripe = getAdsStripe();
    if (!stripe) return NextResponse.json({ error: "Billing is not configured yet.", code: "billing_not_configured" }, { status: 503 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
    const { kind, placement } = parsed.data;
    // Pages opened before the founding offer launched still send the old offer key: sell them the current launch offer.
    const key = kind === "offer" && parsed.data.key === "launch_quarter" ? LAUNCH_QUARTER.key : parsed.data.key;
    const studioLaunch = parsed.data.offer === STUDIO_LAUNCH_OFFER.key;
    if (studioLaunch && (kind !== "plan" || key !== STUDIO_LAUNCH_OFFER.plan || parsed.data.interval === "year")) {
      return NextResponse.json({ error: "That offer is only for the monthly Growth plan.", code: "invalid" }, { status: 400 });
    }
    // New subscriptions only on plans for sale (Growth/Scale are hidden during the founding offer; their
    // existing subscribers change plans in the Customer Portal, never here). Only the current launch offer is sold.
    if (kind === "plan" && !isPlanForSale(key)) return NextResponse.json({ error: "That plan isn't available anymore.", code: "unknown_price" }, { status: 400 });
    if (kind === "offer" && key !== LAUNCH_QUARTER.key && key !== AUTOPILOT_LAUNCH.key) return NextResponse.json({ error: "This launch offer has expired.", code: "offer_expired" }, { status: 410 });
    const annual = kind === "plan" && parsed.data.interval === "year";
    // BFCM: real deadline (Mon 30 Nov 2026 23:59:59 PT), checked here so a stale page can't buy after it.
    // Every $9 unlock bought inside the window gets the BFCM bonus, even from buttons that don't send promo (a 28 Nov
    // buyer got 3 credits instead of 10 because the run-screen unlock button had no promo tag).
    const bfcm = parsed.data.promo === BFCM_PROMO || (kind === "topup" && key === UNLOCK_PACK.key && isBfcmActive());
    const bfcmAnnual = bfcm && annual && !studioLaunch ? bfcmAnnualFor(key) : undefined;
    if (bfcm && !(bfcmAnnual || (kind === "topup" && key === UNLOCK_PACK.key))) return NextResponse.json({ error: "That option isn't part of the Black Friday offer.", code: "invalid" }, { status: 400 });
    if (bfcm && !isBfcmActive()) return NextResponse.json({ error: BFCM_ENDED_LINE, code: "offer_expired" }, { status: 410 });
    const freeMonth = kind === FREE_MONTH_KIND;
    const item = kind === "plan" || freeMonth ? getPlan(freeMonth ? "starter" : key) : kind === "offer" ? getOffer(key) : getTopup(key);
    const plan = kind === "plan" ? getPlan(key) : undefined;
    const priceId = bfcmAnnual ? process.env[bfcmAnnual.priceEnv] || null : annual ? (plan ? annualPriceIdFor(plan) : null) : item ? priceIdFor(item) : null;
    if (!item || !priceId) return NextResponse.json({ error: "That option isn't available.", code: "unknown_price" }, { status: 400 });

    const ws = await getOrCreateWorkspace(user);
    if (ws.suspendedAt) return NextResponse.json({ error: "This workspace is suspended.", code: "suspended" }, { status: 403 });
    // Unlimited week: an add-on for active paid plans only (and only while it is for sale).
    if (kind === "topup" && key === UNLIMITED_WEEK.key && !canBuyUnlimitedWeek(ws)) {
      return NextResponse.json({ error: "Unlimited week is an add-on for paid plans. Pick a plan first.", code: "needs_plan" }, { status: 409 });
    }
    const autopilotLaunch = kind === "offer" && key === AUTOPILOT_LAUNCH.key;
    // Growth Autopilot first month: server-enforced (finished free pack, 7 days, once per workspace).
    if (autopilotLaunch && !(await getAutopilotLaunchState(ws.id)).open) {
      return NextResponse.json({ error: "This first-month offer isn't available on this account.", code: "offer_expired" }, { status: 410 });
    }
    if (kind === "offer" && !autopilotLaunch && !(await getLaunchOfferState(ws.id)).open) {
      return NextResponse.json({ error: "This launch offer has expired.", code: "offer_expired" }, { status: 410 });
    }
    if (studioLaunch && !isStudioLaunchOfferOpen(ws.studioOfferReadyAt, new Date())) {
      return NextResponse.json({ error: "This launch offer has expired.", code: "offer_expired" }, { status: 410 });
    }
    // Growth Autopilot: founding spots are a real limit (first AUTOPILOT_FOUNDING_SPOTS businesses).
    if ((autopilotLaunch || (kind === "plan" && key === "autopilot")) && (await foundingSpotsLeft(prisma)) <= 0) {
      return NextResponse.json({ error: AUTOPILOT_FULL_MESSAGE, code: "founding_full" }, { status: 409 });
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
    // Launch offers (72h post-trial, Studio launch): $100 off the first hero-plan invoice. No coupon = not sold.
    const launchCoupon = offer ? offerCouponId(offer) : studioLaunch ? offerCouponId(LAUNCH_QUARTER) : null;
    if ((offer?.couponEnv || studioLaunch) && !launchCoupon) return NextResponse.json({ error: "That option isn't available.", code: "unknown_price" }, { status: 400 });
    const autopilot = autopilotLaunch || (kind === "plan" && key === "autopilot");
    const founding = !autopilot && ((kind === "plan" && getPlan(key)?.usageMultiple) || (offer && getPlan(offer.plan)?.usageMultiple));
    const unlockCredit = couponId && !ws.stripeSubscriptionId
      ? Boolean(await prisma.creditLedger.findFirst({ where: { workspaceId: ws.id, reason: "topup", note: UNLOCK_PACK_NOTE, delta: { gt: 0 } }, select: { id: true } }))
      : false;
    const visitorId = request.cookies.get(VISITOR_COOKIE)?.value?.slice(0, 64); // lets the webhook count `purchased` for offer experiments
    const metadata = { product: "ads", workspaceId: ws.id, kind, ...(visitorId ? { kmdVid: visitorId } : {}), ...(kind === "plan" || freeMonth ? { plan: freeMonth ? "starter" : key, interval: annual ? "year" : "month", ...(studioLaunch ? { offer: STUDIO_LAUNCH_OFFER.key } : {}), ...(legacySwitch ? { legacySwitch } : {}) } : offer ? { plan: offer.plan, offer: offer.key } : { topup: key }), ...(bfcm ? { promo: BFCM_PROMO } : {}) };
    // The $9 unlock returns to the pack that was just unlocked (it used to land on billing and buyers couldn't find their ads).
    const unlockRunId = kind === "topup" && key === UNLOCK_PACK.key
      ? (await prisma.adRun.findFirst({ where: { workspaceId: ws.id, isTrial: true }, orderBy: { createdAt: "desc" }, select: { id: true } }))?.id ?? null
      : null;
    const session = await stripe.checkout.sessions.create({
      mode: recurring ? "subscription" : "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      ...komendlyCheckoutText(autopilot ? "autopilot" : founding ? "founding" : recurring ? "plan" : "pack"),
      ...(recurring
        ? { subscription_data: { metadata, ...(freeMonth ? { trial_period_days: freeMonthCheckoutParams().trialDays } : {}) } }
        : { payment_intent_data: { metadata, setup_future_usage: "off_session" as const } }),
      // Card on file: one-time payments save the card on the customer (setup_future_usage above; subscriptions save it
      // anyway), and every later Checkout shows the saved card so the next purchase is one tap.
      saved_payment_method_options: { allow_redisplay_filters: ["always", "limited", "unspecified"] },
      ...(launchCoupon ? { discounts: [{ coupon: launchCoupon }] } : unlockCredit && couponId ? { discounts: [{ coupon: couponId }] } : {}),
      ...(freeMonth ? { payment_method_collection: freeMonthCheckoutParams().payment_method_collection } : {}),
      // Hiring Ozzy's team (Growth Autopilot / Agency) lands on the team page; everything else (Ad Department too) on billing.
      success_url: `${appUrl()}${hiresTeam(kind, kind === "offer" ? offer?.plan : key) ? "/ads/team" : unlockRunId ? `/ads/runs/${unlockRunId}` : "/ads/billing"}?checkout=success${kind === "topup" && key === UNLOCK_PACK.key ? `&bought=${UNLOCK_PACK.key}` : ""}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/ads/billing?checkout=canceled${kind === "topup" || freeMonth ? "" : `&declined=${encodeURIComponent(key)}`}`,
    });
    const trade = await workspaceTrade(ws.id);
    await trackAdsEvent("checkout_started", { workspaceId: ws.id, userId: user.id, props: { kind, key, sessionId: session.id, ...(trade ? { trade } : {}), ...(studioLaunch ? { offer: STUDIO_LAUNCH_OFFER.key, app: "studio", amountCents: item.priceCents, currency: "USD" } : {}), ...(annual ? { interval: "year" } : {}), ...(bfcm ? { promo: BFCM_PROMO } : {}), ...(placement ? { placement } : {}), ...(unlockCredit ? { coupon: "unlock_pack_credit" } : {}) } });
    void recordOfferConversions("checkout_started", request.cookies.get(VISITOR_COOKIE)?.value, { workspaceId: ws.id, key });
    if (studioLaunch) await trackAdsEvent("studio_checkout_started", { workspaceId: ws.id, userId: user.id, props: { offer: STUDIO_LAUNCH_OFFER.key, plan: key, amountCents: item.priceCents } });
    const downsell = placement === "downsell" || placement === "unlock_pack";
    if (kind === "offer" || studioLaunch || (placement && !downsell)) await trackAdsEvent("upsell_accepted", { workspaceId: ws.id, userId: user.id, props: { kind, key, ...(placement ? { placement } : {}) } });
    if (downsell) await trackAdsEvent("downsell_accepted", { workspaceId: ws.id, userId: user.id, props: { kind, key, ...(placement ? { placement } : {}) } });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

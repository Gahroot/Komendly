import { NextRequest, NextResponse } from "next/server";
import { komendlyCheckoutText } from "@/lib/checkout-branding";
import { stripe, STRIPE_PRICE_IDS_V2, resolveSubscriptionPlan } from "@/lib/stripe";
import { subscriptionLineItem } from "@/lib/plan-pricing";
import { PLAN_PRICE_VERSION } from "@/lib/stripe-config";
import { prisma } from "@/lib/prisma";
import { type PlanKey } from "@/lib/stripe-config";
import { createSession, setSessionCookie } from "@/lib/auth";
import { fulfilCreditPurchase } from "@/lib/credit-fulfilment";
import { FIRST_VIDEO_OFFER, isLegacyTestimonialSubscriber } from "@/lib/first-video-offer";
import { findOfferUser, startFirstVideoCheckout } from "@/lib/first-video-server";

const OFFER_ERRORS = {
  has_subscription: "You already have a plan, so the first-video offer doesn't apply. Top up minutes from Billing instead.",
  already_purchased: "The first-video offer is one per customer. Pick a plan to keep going.",
} as const;

/** One-time Launch Kit ("first_video") checkout for brand-new users (registered, not yet paying). */
async function postFirstVideo(request: NextRequest, userId: unknown, email: unknown) {
  if (typeof userId !== "string" || typeof email !== "string" || !userId || !email) {
    return NextResponse.json({ error: "Missing required fields: userId, email" }, { status: 400 });
  }
  const user = await findOfferUser(userId);
  // The email must match too, so a guessed user id alone can't start someone else's checkout.
  if (!user || user.email.toLowerCase() !== email.toLowerCase()) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cancelPath = `/pricing?canceled=true&userId=${encodeURIComponent(user.id)}&email=${encodeURIComponent(user.email)}`;
  const result = await startFirstVideoCheckout(user, origin, cancelPath);
  if (!result.ok) {
    return NextResponse.json({ error: OFFER_ERRORS[result.reason], reason: result.reason }, { status: 409 });
  }
  return NextResponse.json({ url: result.url, sessionId: result.sessionId });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planKey, userId, email, billingCycle = "monthly", offer } = body;

    if (offer === FIRST_VIDEO_OFFER.key) {
      return await postFirstVideo(request, userId, email);
    }

    if (!planKey || !userId || !email) {
      return NextResponse.json(
        { error: "Missing required fields: planKey, userId, email" },
        { status: 400 }
      );
    }

    // Validate plan key
    if (!["starter", "pro", "enterprise"].includes(planKey)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    if (billingCycle !== "monthly" && billingCycle !== "yearly") {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
    }
    // Current prices only: a configured v2 price ID, else inline price_data (legacy IDs are grandfathered, never sold).
    const lineItem = subscriptionLineItem(planKey as PlanKey, billingCycle, STRIPE_PRICE_IDS_V2);

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    // Testimonial monthly plans are grandfathered: new subscriptions go to Ozzy plans (Scale/Agency include testimonials).
    if (!isLegacyTestimonialSubscriber(user)) {
      return NextResponse.json({ error: "Testimonial videos are now included in the Ozzy Scale and Agency plans.", code: "legacy_only", url: "/pricing" }, { status: 409 });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          userId: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to user
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Upsell from the dashboard: credit a Launch Kit buyer's first month when a coupon is configured.
    const launchCoupon = process.env.STRIPE_LAUNCH_CREDIT_COUPON;
    let launchCredit: string | null = null;
    if (body.launchCredit === true && launchCoupon && !user.stripeSubscriptionId) {
      const bought = await prisma.creditPurchase.count({ where: { userId: user.id } });
      if (bought > 0) launchCredit = launchCoupon;
    }

    // Get the base URL from request
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      ...komendlyCheckoutText("testimonials"),
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [lineItem],
      metadata: {
        userId: userId,
        billingCycle: billingCycle,
        planKey: planKey,
        planVersion: PLAN_PRICE_VERSION,
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true&userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}`,
      subscription_data: {
        metadata: {
          userId: userId,
          planKey: planKey,
          planVersion: PLAN_PRICE_VERSION,
        },
      },
      billing_address_collection: "required",
      // Launch Kit credit on the first month: only via a preconfigured coupon (no live objects created here).
      ...(launchCredit ? { discounts: [{ coupon: launchCredit }] } : { allow_promotion_codes: true }),
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

// Get checkout session status (for success page)
// Also syncs subscription data if webhook hasn't processed yet (race condition fix)
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Payment not completed", status: session.payment_status },
        { status: 400 }
      );
    }

    const userId = session.metadata?.userId;
    if (!userId) {
      return NextResponse.json({ error: "User not found in session" }, { status: 400 });
    }

    // One-time minutes (first-video offer / credit pack): fulfil here too, in case the webhook is late.
    // Same PaymentIntent id as the webhook, so whichever runs second is a no-op.
    if (session.mode === "payment" && session.metadata?.type === "credit_purchase") {
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      const minutes = parseInt(session.metadata.minutes || "0", 10);
      if (!paymentIntentId) {
        return NextResponse.json({ error: "Payment not found" }, { status: 400 });
      }
      const result = await fulfilCreditPurchase(prisma, {
        userId,
        stripePaymentId: paymentIntentId,
        minutes,
        amountPaid: session.amount_total ?? 0,
      });
      if (result.status === "invalid") {
        return NextResponse.json({ error: "Invalid purchase" }, { status: 400 });
      }
      // The session id is only known to the payer, so it is safe to sign them in here.
      await setSessionCookie(await createSession(userId));
      const buyer = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, plan: true, subscriptionStatus: true, minutesLimit: true, bonusMinutes: true },
      });
      return NextResponse.json({
        success: true,
        user: buyer,
        purchase: { offer: session.metadata.offer ?? "credit_pack", minutes, amount: (session.amount_total ?? 0) / 100, signedIn: true },
      });
    }

    // Get current user data
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
        minutesLimit: true,
      },
    });

    // If webhook hasn't processed yet (plan still pending or minutesLimit is 0),
    // sync subscription data directly from Stripe session
    if (user && (user.plan === "pending" || user.minutesLimit === 0) && session.subscription) {
      const subscriptionId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;
      const customerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;

      // Retrieve full subscription details
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price.id;

      const resolved = resolveSubscriptionPlan(subscription);

      if (resolved) {
        const { plan, minutes: minutesLimit } = resolved;
        // Access subscription period timestamps (Stripe returns Unix seconds)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subData = subscription as any;
        const periodStart = subData.current_period_start as number | undefined;
        const periodEnd = subData.current_period_end as number | undefined;

        // Validate timestamps exist before converting to Date
        const periodStartDate = periodStart ? new Date(periodStart * 1000) : new Date();
        const periodEndDate = periodEnd ? new Date(periodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Sync subscription data (webhook may have missed or been delayed)
        user = await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            subscriptionStatus: "active",
            subscriptionPriceId: priceId,
            plan: plan,
            minutesLimit: minutesLimit,
            minutesUsed: 0,
            currentPeriodStart: periodStartDate,
            currentPeriodEnd: periodEndDate,
            lastUsageReset: new Date(),
          },
          select: {
            id: true,
            email: true,
            name: true,
            plan: true,
            subscriptionStatus: true,
            minutesLimit: true,
          },
        });

        console.log(`Synced subscription for user ${userId}: ${plan} with ${minutesLimit} minutes (webhook fallback)`);
      }
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error retrieving checkout session:", error);
    return NextResponse.json(
      { error: "Failed to retrieve session" },
      { status: 500 }
    );
  }
}

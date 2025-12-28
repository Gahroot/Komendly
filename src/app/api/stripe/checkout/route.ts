import { NextRequest, NextResponse } from "next/server";
import { stripe, SUBSCRIPTION_PLANS } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { type PlanKey } from "@/lib/stripe-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planKey, userId, email, billingCycle = "monthly" } = body;

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

    // Get price ID from plan configuration
    const plan = SUBSCRIPTION_PLANS[planKey as PlanKey];
    const priceId = billingCycle === "yearly" ? plan.prices.yearly : plan.prices.monthly;

    if (!priceId) {
      console.error("Price ID not configured for:", planKey, billingCycle);
      return NextResponse.json(
        { error: "Price not configured. Please check environment variables." },
        { status: 500 }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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

    // Get the base URL from request
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: userId,
        billingCycle: billingCycle,
        planKey: planKey,
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=true`,
      subscription_data: {
        metadata: {
          userId: userId,
        },
      },
      billing_address_collection: "required",
      allow_promotion_codes: true,
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

      // Dynamically import to get plan info
      const { getPlanFromPriceId, getMinutesForPlan } = await import("@/lib/stripe");
      const plan = getPlanFromPriceId(priceId);

      if (plan) {
        const minutesLimit = getMinutesForPlan(plan);
        const periodStart = (subscription as unknown as { current_period_start: number }).current_period_start;
        const periodEnd = (subscription as unknown as { current_period_end: number }).current_period_end;

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
            currentPeriodStart: new Date(periodStart * 1000),
            currentPeriodEnd: new Date(periodEnd * 1000),
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

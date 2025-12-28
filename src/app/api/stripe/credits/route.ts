import { NextRequest, NextResponse } from "next/server";
import { stripe, CREDIT_PURCHASE } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // Validate user is authenticated
    const sessionToken = request.cookies.get("session_token")?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionData = await validateSession(sessionToken);
    if (!sessionData) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const body = await request.json();
    const { minutes } = body;

    // Validate minutes
    if (!minutes || typeof minutes !== "number") {
      return NextResponse.json({ error: "Minutes is required" }, { status: 400 });
    }

    if (minutes < CREDIT_PURCHASE.minimumMinutes) {
      return NextResponse.json(
        { error: `Minimum purchase is ${CREDIT_PURCHASE.minimumMinutes} minute(s)` },
        { status: 400 }
      );
    }

    if (minutes > CREDIT_PURCHASE.maximumMinutes) {
      return NextResponse.json(
        { error: `Maximum purchase is ${CREDIT_PURCHASE.maximumMinutes} minutes` },
        { status: 400 }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: sessionData.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // User must have an active subscription to buy credits
    if (user.subscriptionStatus !== "active") {
      return NextResponse.json(
        { error: "You must have an active subscription to purchase additional minutes" },
        { status: 403 }
      );
    }

    // Calculate amount
    const amount = minutes * CREDIT_PURCHASE.pricePerMinute;

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Get the base URL
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create checkout session for one-time payment
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${minutes} Additional Video Minutes`,
              description: `One-time purchase of ${minutes} additional minute(s) of video generation`,
            },
            unit_amount: CREDIT_PURCHASE.pricePerMinute,
          },
          quantity: minutes,
        },
      ],
      payment_intent_data: {
        metadata: {
          type: "credit_purchase",
          userId: user.id,
          minutes: minutes.toString(),
        },
      },
      metadata: {
        type: "credit_purchase",
        userId: user.id,
        minutes: minutes.toString(),
      },
      success_url: `${origin}/dashboard?credits_purchased=${minutes}`,
      cancel_url: `${origin}/dashboard/billing?canceled=true`,
    });

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      amount: amount / 100, // Return in dollars
    });
  } catch (error) {
    console.error("Error creating credit purchase session:", error);
    return NextResponse.json(
      { error: "Failed to create credit purchase session" },
      { status: 500 }
    );
  }
}

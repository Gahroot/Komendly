import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, getPlanFromPriceId, getMinutesForPlan, mapStripeStatus } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log(`Received Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        // Handle one-time credit purchases
        if (paymentIntent.metadata?.type === "credit_purchase") {
          await handleCreditPurchase(paymentIntent);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook ${event.type}:`, error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!userId) {
    console.error("No userId in checkout session metadata");
    return;
  }

  console.log(`Checkout completed for user ${userId}, subscription ${subscriptionId}`);

  // Retrieve the subscription to get details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);

  if (!plan) {
    console.error(`Unknown price ID: ${priceId}`);
    return;
  }

  const minutesLimit = getMinutesForPlan(plan);

  // Get period dates from subscription
  const periodStart = (subscription as unknown as { current_period_start: number }).current_period_start;
  const periodEnd = (subscription as unknown as { current_period_end: number }).current_period_end;

  // Update user with subscription details
  await prisma.user.update({
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
  });

  console.log(`User ${userId} upgraded to ${plan} with ${minutesLimit} minutes/month`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = getPlanFromPriceId(priceId);

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.log(`No user found for customer ${customerId}`);
    return;
  }

  // Get period dates from subscription
  const periodStart = (subscription as unknown as { current_period_start: number }).current_period_start;
  const periodEnd = (subscription as unknown as { current_period_end: number }).current_period_end;

  const updateData: Record<string, unknown> = {
    subscriptionStatus: mapStripeStatus(subscription.status),
    subscriptionPriceId: priceId,
    currentPeriodStart: new Date(periodStart * 1000),
    currentPeriodEnd: new Date(periodEnd * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };

  // Update plan and minutes if subscription is active and plan is valid
  if (subscription.status === "active" && plan) {
    updateData.plan = plan;
    updateData.minutesLimit = getMinutesForPlan(plan) + user.bonusMinutes;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  console.log(`Subscription updated for user ${user.id}: status=${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    console.log(`No user found for customer ${customerId}`);
    return;
  }

  // Downgrade to pending (no active subscription)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: "canceled",
      plan: "pending",
      minutesLimit: user.bonusMinutes, // Only keep bonus minutes
      stripeSubscriptionId: null,
      cancelAtPeriodEnd: false,
    },
  });

  console.log(`Subscription deleted for user ${user.id}`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (invoice.billing_reason !== "subscription_cycle") {
    return; // Only handle subscription renewals
  }

  const customerId = invoice.customer as string;
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    return;
  }

  // Reset usage for new billing period
  type ValidPlan = "starter" | "pro" | "enterprise";
  const plan = user.plan as ValidPlan | "pending" | "free";
  const baseMinutes = (plan !== "pending" && plan !== "free") ? getMinutesForPlan(plan as ValidPlan) : 0;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      minutesUsed: 0,
      minutesLimit: baseMinutes + user.bonusMinutes,
      lastUsageReset: new Date(),
      subscriptionStatus: "active",
    },
  });

  console.log(`Usage reset for user ${user.id} on subscription renewal`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: "past_due",
    },
  });

  console.log(`Payment failed for user ${user.id}`);
}

async function handleCreditPurchase(paymentIntent: Stripe.PaymentIntent) {
  const userId = paymentIntent.metadata?.userId;
  const minutes = parseInt(paymentIntent.metadata?.minutes || "0", 10);

  if (!userId || minutes <= 0) {
    console.error("Invalid credit purchase metadata");
    return;
  }

  // Record the purchase
  await prisma.creditPurchase.create({
    data: {
      userId,
      stripePaymentId: paymentIntent.id,
      minutes,
      amountPaid: paymentIntent.amount,
    },
  });

  // Add minutes to user's account
  await prisma.user.update({
    where: { id: userId },
    data: {
      bonusMinutes: { increment: minutes },
      minutesLimit: { increment: minutes },
    },
  });

  console.log(`Added ${minutes} bonus minutes to user ${userId}`);
}

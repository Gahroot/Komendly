// Stripe webhook for Website2ads only (separate endpoint + secret from the video product).
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getAdsStripe } from "@/lib/ads/billing-stripe";
import { handleAdsStripeEvent } from "@/lib/ads/billing-webhook";

export async function POST(request: NextRequest) {
  const stripe = getAdsStripe();
  const secret = process.env.STRIPE_ADS_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Ads billing webhook not configured" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    const handled = await handleAdsStripeEvent(event);
    return NextResponse.json({ received: true, handled });
  } catch (err) {
    console.error(`[ads-billing] webhook ${event.type} failed`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 }); // Stripe retries; handlers are idempotent
  }
}

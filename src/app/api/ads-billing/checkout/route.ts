import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPlan, getTopup, priceIdFor } from "@/lib/ads/billing-config";
import { appUrl, getAdsStripe } from "@/lib/ads/billing-stripe";
import { trackAdsEvent } from "@/lib/ads/events";
import { prisma } from "@/lib/prisma";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

const Body = z.object({ kind: z.enum(["plan", "topup"]), key: z.string().max(40) });

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const stripe = getAdsStripe();
    if (!stripe) return NextResponse.json({ error: "Billing is not configured yet.", code: "billing_not_configured" }, { status: 503 });
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "invalid" }, { status: 400 });
    const { kind, key } = parsed.data;
    const item = kind === "plan" ? getPlan(key) : getTopup(key);
    const priceId = item ? priceIdFor(item) : null;
    if (!item || !priceId) return NextResponse.json({ error: "That option isn't available.", code: "unknown_price" }, { status: 400 });

    const ws = await getOrCreateWorkspace(user);
    if (ws.suspendedAt) return NextResponse.json({ error: "This workspace is suspended.", code: "suspended" }, { status: 403 });
    if (kind === "plan" && ws.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(ws.subscriptionStatus)) {
      return NextResponse.json({ error: "You already have a plan. Use Manage subscription to change it.", code: "has_subscription" }, { status: 409 });
    }
    let customerId = ws.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: ws.name, metadata: { product: "ads", workspaceId: ws.id } });
      customerId = customer.id;
      await prisma.adsWorkspace.update({ where: { id: ws.id }, data: { stripeCustomerId: customerId } });
    }
    const metadata = { product: "ads", workspaceId: ws.id, kind, ...(kind === "plan" ? { plan: key } : { topup: key }) };
    const session = await stripe.checkout.sessions.create({
      mode: kind === "plan" ? "subscription" : "payment",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      ...(kind === "plan" ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
      success_url: `${appUrl()}/ads/billing?checkout=success`,
      cancel_url: `${appUrl()}/ads/billing?checkout=canceled`,
    });
    await trackAdsEvent("checkout_started", { workspaceId: ws.id, userId: user.id, props: { kind, key } });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

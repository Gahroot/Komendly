import { NextResponse } from "next/server";
import { appUrl, getAdsStripe } from "@/lib/ads/billing-stripe";
import { adsErrorResponse, getOrCreateWorkspace, requireUser } from "@/lib/ads/workspace";

export async function POST() {
  try {
    const user = await requireUser();
    const stripe = getAdsStripe();
    if (!stripe) return NextResponse.json({ error: "Billing is not configured yet.", code: "billing_not_configured" }, { status: 503 });
    const ws = await getOrCreateWorkspace(user);
    if (!ws.stripeCustomerId) return NextResponse.json({ error: "No billing account yet. Pick a plan first.", code: "no_customer" }, { status: 400 });
    // Ads-only portal config (plan switching between ads plans incl. Agency + yearly); the account default is shared with testimonials.
    const configuration = process.env.STRIPE_ADS_PORTAL_CONFIG_ID || undefined;
    const session = await stripe.billingPortal.sessions.create({ customer: ws.stripeCustomerId, return_url: `${appUrl()}/ads/billing`, ...(configuration ? { configuration } : {}) });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return adsErrorResponse(error);
  }
}

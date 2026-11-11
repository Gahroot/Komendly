import { getAdsStripe } from "@/lib/ads/billing-stripe";

export type CheckoutPixel = { sessionId: string; subscription: boolean; value: number; currency: string };

/**
 * Browser Purchase details for the billing success page: the same ids the webhook sends to CAPI
 * (Purchase:<sessionId>, Subscribe:<sessionId>). Only for this workspace's paid sessions; null otherwise.
 */
export async function loadCheckoutPixel(sessionId: string | undefined, workspaceId: string): Promise<CheckoutPixel | null> {
  if (!sessionId || !/^cs_[\w]+$/.test(sessionId)) return null;
  const stripe = getAdsStripe();
  if (!stripe) return null;
  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);
    if (s.metadata?.workspaceId !== workspaceId || s.payment_status !== "paid") return null;
    return { sessionId: s.id, subscription: s.mode === "subscription", value: (s.amount_total ?? 0) / 100, currency: (s.currency ?? "usd").toUpperCase() };
  } catch {
    return null;
  }
}

// Server side of abandoned-checkout recovery (web only): record checkout starts/expiries and the one-time coupon.
import type Stripe from "stripe";
import { checkoutFromSession, type RecoveryCouponParams, type SessionLike } from "./checkout-recovery";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventDb = { adsEvent: { findFirst(a: any): Promise<any>; create(a: any): Promise<any> } };

/**
 * Record a Stripe checkout as checkout_started once per session id (route start or checkout.session.expired webhook).
 * Direct row (no Meta CAPI / founder alert). Never throws.
 */
export async function recordCheckoutSession(db: EventDb, session: SessionLike, owner: { userId?: string | null; workspaceId?: string | null } = {}, source = "route"): Promise<boolean> {
  try {
    const c = checkoutFromSession(session);
    const userId = owner.userId ?? c?.userId;
    if (!c || !userId) return false;
    const seen = await db.adsEvent.findFirst({ where: { name: "checkout_started", props: { path: ["sessionId"], equals: session.id } }, select: { id: true } });
    if (seen) return false;
    await db.adsEvent.create({
      data: {
        name: "checkout_started",
        userId,
        workspaceId: owner.workspaceId ?? c.workspaceId,
        createdAt: c.startedAt,
        props: { kind: c.item.kind, key: c.item.key, ...(c.item.interval ? { interval: c.item.interval } : {}), billing: c.billing, sessionId: session.id, source, amountCents: c.amountCents },
      },
    });
    return true;
  } catch (e) {
    console.warn("[checkout_recovery] record checkout failed", e instanceof Error ? e.message : e);
    return false;
  }
}

type CouponApi = { coupons: { retrieve(id: string): Promise<{ id: string; valid: boolean }>; create(p: Stripe.CouponCreateParams): Promise<{ id: string; valid: boolean }> } };

/** The checkout's one-time recovery coupon: reused when it exists and is still valid, else created. null = no discount. */
export async function ensureRecoveryCoupon(stripe: CouponApi, params: RecoveryCouponParams | null): Promise<string | null> {
  if (!params) return null;
  try {
    const c = await stripe.coupons.retrieve(params.id);
    return c.valid ? c.id : null;
  } catch (e) {
    if ((e as { code?: string })?.code !== "resource_missing") throw e;
  }
  const c = await stripe.coupons.create(params as Stripe.CouponCreateParams);
  return c.valid ? c.id : null;
}

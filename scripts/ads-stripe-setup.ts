// Creates Website2ads products + prices in Stripe (TEST mode by default) and prints the env vars.
// Idempotent: reuses prices found by lookup_key. Refuses live keys unless --live is passed.
// Usage: set -a; . ./.env.local; set +a; npx tsx scripts/ads-stripe-setup.ts [--live] [--api-key sk_...] [--only unlock_pack]
// --only unlock_pack: just the $9 "Unlock this pack" price + its "$9 off the first Starter month" coupon (touches nothing else).
import Stripe from "stripe";
import { ADS_PLANS, ADS_TOPUPS, LAUNCH_QUARTER, UNLOCK_PACK, UNLOCK_PACK_COUPON_ENV } from "../src/lib/ads/billing-config";

const UNLOCK_COUPON_ID = `ads_unlock_pack_credit_${UNLOCK_PACK.priceCents}`;

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Fixed-id coupon: $9 off once (the unlock_pack price credited off the first Starter invoice). Idempotent. */
async function ensureUnlockCoupon(stripe: Stripe): Promise<string> {
  try {
    return (await stripe.coupons.retrieve(UNLOCK_COUPON_ID)).id;
  } catch (e) {
    if (!(e instanceof Stripe.errors.StripeInvalidRequestError) || e.statusCode !== 404) throw e;
  }
  const coupon = await stripe.coupons.create({ id: UNLOCK_COUPON_ID, name: "Your pack unlock, credited", amount_off: UNLOCK_PACK.priceCents, currency: "usd", duration: "once", metadata: { product: "ads", offer: UNLOCK_PACK.key } });
  return coupon.id;
}

async function ensurePrice(stripe: Stripe, item: { name: string; priceCents: number; lookupKey: string; recurring: boolean; credits: number; intervalCount?: number }) {
  const existing = await stripe.prices.list({ lookup_keys: [item.lookupKey], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const product = await stripe.products.create({
    name: `Website2ads ${item.name}`,
    metadata: { product: "ads", credits: String(item.credits) },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: item.priceCents,
    lookup_key: item.lookupKey,
    metadata: { product: "ads", credits: String(item.credits) },
    ...(item.recurring ? { recurring: { interval: "month" as const, interval_count: item.intervalCount ?? 1 } } : {}),
  });
  return price.id;
}

async function main() {
  const key = argValue("--api-key") ?? process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set: nothing to do.");
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (live && !process.argv.includes("--live")) throw new Error("Refusing to run with a LIVE key. Pass --live if you really mean it.");
  const stripe = new Stripe(key, { typescript: true });
  const lines: string[] = [];
  const unlockId = await ensurePrice(stripe, { name: UNLOCK_PACK.name, priceCents: UNLOCK_PACK.priceCents, lookupKey: `ads_${UNLOCK_PACK.key}_${UNLOCK_PACK.priceCents}_${UNLOCK_PACK.credits}`, recurring: false, credits: UNLOCK_PACK.credits });
  lines.push(`${UNLOCK_PACK.priceEnv}=${unlockId}`, `${UNLOCK_PACK_COUPON_ENV}=${await ensureUnlockCoupon(stripe)}`);
  if (argValue("--only") === UNLOCK_PACK.key) {
    console.log(`# ${UNLOCK_PACK.name} (${live ? "LIVE" : "test"} mode). Add to your env:`);
    console.log(lines.join("\n"));
    return;
  }
  for (const p of ADS_PLANS) {
    const id = await ensurePrice(stripe, { name: `${p.name} (monthly)`, priceCents: p.priceCents, lookupKey: `ads_${p.key}_monthly_${p.priceCents}_${p.monthlyCredits}`, recurring: true, credits: p.monthlyCredits });
    lines.push(`${p.priceEnv}=${id}`);
  }
  for (const t of ADS_TOPUPS) {
    const id = await ensurePrice(stripe, { name: `Top-up ${t.name}`, priceCents: t.priceCents, lookupKey: `ads_${t.key}_${t.priceCents}_${t.credits}`, recurring: false, credits: t.credits });
    lines.push(`${t.priceEnv}=${id}`);
  }
  // Additive offer price (post-trial upsell); never replaces or archives the plan prices.
  const lq = LAUNCH_QUARTER;
  const lqId = await ensurePrice(stripe, { name: `${lq.name} (every ${lq.intervalMonths} months)`, priceCents: lq.priceCents, lookupKey: `ads_${lq.key}_${lq.priceCents}_${lq.creditsPerPeriod}`, recurring: true, intervalCount: lq.intervalMonths, credits: lq.creditsPerPeriod });
  lines.push(`${lq.priceEnv}=${lqId}`);
  console.log(`# Website2ads Stripe prices (${live ? "LIVE" : "test"} mode). Add to your env:`);
  console.log(lines.join("\n"));
  console.log("# Also create a webhook endpoint -> /api/ads-billing/webhook (checkout.session.completed, invoice.paid,");
  console.log("# customer.subscription.updated, customer.subscription.deleted, charge.refunded) and set STRIPE_ADS_WEBHOOK_SECRET.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

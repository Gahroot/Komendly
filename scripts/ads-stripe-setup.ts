// Creates Website2ads products + prices in Stripe (TEST mode by default) and prints the env vars.
// Idempotent: reuses prices found by lookup_key. Refuses live keys unless --live is passed.
// Usage: set -a; . ./.env.local; set +a; npx tsx scripts/ads-stripe-setup.ts [--live]
import Stripe from "stripe";
import { ADS_PLANS, ADS_TOPUPS } from "../src/lib/ads/billing-config";

async function ensurePrice(stripe: Stripe, item: { name: string; priceCents: number; lookupKey: string; recurring: boolean; credits: number }) {
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
    ...(item.recurring ? { recurring: { interval: "month" as const } } : {}),
  });
  return price.id;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set: nothing to do.");
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (live && !process.argv.includes("--live")) throw new Error("Refusing to run with a LIVE key. Pass --live if you really mean it.");
  const stripe = new Stripe(key, { typescript: true });
  const lines: string[] = [];
  for (const p of ADS_PLANS) {
    const id = await ensurePrice(stripe, { name: `${p.name} (monthly)`, priceCents: p.priceCents, lookupKey: `ads_${p.key}_monthly_${p.priceCents}_${p.monthlyCredits}`, recurring: true, credits: p.monthlyCredits });
    lines.push(`${p.priceEnv}=${id}`);
  }
  for (const t of ADS_TOPUPS) {
    const id = await ensurePrice(stripe, { name: `Top-up ${t.name}`, priceCents: t.priceCents, lookupKey: `ads_${t.key}_${t.priceCents}_${t.credits}`, recurring: false, credits: t.credits });
    lines.push(`${t.priceEnv}=${id}`);
  }
  console.log(`# Website2ads Stripe prices (${live ? "LIVE" : "test"} mode). Add to your env:`);
  console.log(lines.join("\n"));
  console.log("# Also create a webhook endpoint -> /api/ads-billing/webhook (checkout.session.completed, invoice.paid,");
  console.log("# customer.subscription.updated, customer.subscription.deleted, charge.refunded) and set STRIPE_ADS_WEBHOOK_SECRET.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

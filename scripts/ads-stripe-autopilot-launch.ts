// Creates the Stripe coupon behind the Growth Autopilot first month ($97, then the founding $297/month):
// a fixed-id "once" coupon of $200 off the first autopilot invoice. Idempotent (reuses the coupon by id).
// DRY RUN by default: prints what it would create and changes nothing. Pass --live to create it.
// Usage: set -a; . ./.env.local; set +a; npx tsx scripts/ads-stripe-autopilot-launch.ts [--live] [--api-key sk_...]
// Then set STRIPE_ADS_AUTOPILOT_LAUNCH_COUPON_ID=<printed id> on Vercel (web). Optional on the engine service:
// LIFECYCLE_AUTOPILOT_FIRST_MONTH=1 lets the $9-buyer emails mention the $97 first month (set it only after the coupon is live).
import Stripe from "stripe";
import { AUTOPILOT_FIRST_MONTH_CENTS, AUTOPILOT_LAUNCH, AUTOPILOT_LAUNCH_COUPON_ENV, AUTOPILOT_LAUNCH_OFF_CENTS, AUTOPILOT_PRICE_CENTS } from "../src/lib/ads/billing-config";

const COUPON_ID = `ads_autopilot_first_month_${AUTOPILOT_LAUNCH_OFF_CENTS}`;

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const create = process.argv.includes("--live");
  const key = argValue("--api-key") ?? process.env.STRIPE_SECRET_KEY;
  console.log(`${create ? "CREATE" : "DRY RUN"}: coupon ${COUPON_ID}: $${AUTOPILOT_LAUNCH_OFF_CENTS / 100} off once = $${AUTOPILOT_FIRST_MONTH_CENTS / 100} first month, then $${AUTOPILOT_PRICE_CENTS / 100}/month`);
  if (!key) {
    if (create) throw new Error("STRIPE_SECRET_KEY is not set.");
    console.log("(no Stripe key: not checking whether it already exists)");
    console.log(`${AUTOPILOT_LAUNCH_COUPON_ENV}=${COUPON_ID}`);
    return;
  }
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (live && !create) console.log("Live key detected: dry run only reads.");
  if (create && !live) console.log("Note: --live was passed with a TEST key: creating the coupon in test mode.");
  const stripe = new Stripe(key, { typescript: true });
  try {
    const found = await stripe.coupons.retrieve(COUPON_ID);
    console.log(`exists already (${live ? "live" : "test"} mode)`);
    console.log(`${AUTOPILOT_LAUNCH_COUPON_ENV}=${found.id}`);
    return;
  } catch {
    // not found: fall through
  }
  if (!create) {
    console.log("does not exist yet; rerun with --live to create it");
    console.log(`${AUTOPILOT_LAUNCH_COUPON_ENV}=${COUPON_ID}`);
    return;
  }
  const coupon = await stripe.coupons.create({ id: COUPON_ID, name: "Growth Autopilot first month", amount_off: AUTOPILOT_LAUNCH_OFF_CENTS, currency: "usd", duration: "once", metadata: { product: "ads", offer: AUTOPILOT_LAUNCH.key } });
  console.log(`created`);
  console.log(`${AUTOPILOT_LAUNCH_COUPON_ENV}=${coupon.id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

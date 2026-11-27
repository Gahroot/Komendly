// Black Friday to Cyber Monday 2026 offer (owner brief 2026-11-27). Pure: safe in client components.
// One real deadline, enforced on the server (checkout route + offer API + page renders): Cyber Monday, Mon 30 Nov 2026
// 23:59:59 America/Los_Angeles (PST, UTC-8) = 2026-12-01T07:59:59Z (owner: "until Monday night"). After it every BFCM surface disappears by itself and the
// checkout refuses promo=bfcm. Nothing resets: the countdown is to this fixed instant, never per visitor.
// What it is: the $9 unlock with a stacked credit bonus (the fast first payment), then annual prepay for the two
// monthly plans at a BFCM-only price with bonus credits (pulls cash forward). Plans, credits and refunds go through
// the normal ads webhook (src/lib/ads/billing-webhook.ts), idempotent per checkout session / invoice.
import { BFCM_ANNUAL_PRICES, getPlan, UNLOCK_PACK, type AdsTopupPack, type PromoAnnualPrice } from "./billing-config";

export const BFCM_PROMO = "bfcm";
/** Fri 27 Nov 2026 (Black Friday) 00:00 PT: live as soon as it deploys. */
export const BFCM_STARTS_AT = new Date("2026-11-27T08:00:00.000Z");
/** Last valid moment (inclusive): Mon 30 Nov 2026 23:59:59 PT. */
export const BFCM_ENDS_AT = new Date("2026-12-01T07:59:59.000Z");
/** The deadline in words, everywhere the offer is shown. */
export const BFCM_DEADLINE_LINE = "Ends Monday night (Nov 30, 11:59 pm PT)";
export const BFCM_ENDED_LINE = "The Black Friday offer ended on Monday night (Nov 30, 11:59 pm PT).";

/** Extra credits on the BFCM $9 unlock: 3 + 7 = 10 credits (10 brand-new single-size ads). */
export const BFCM_UNLOCK_BONUS_CREDITS = 7;
/** Extra credits on a BFCM annual prepay, once on the first yearly invoice: a Starter month (60) for each of the 12 months. */
export const BFCM_ANNUAL_BONUS_CREDITS = 720;

export function isBfcmActive(now: Date = new Date()): boolean {
  const t = now.getTime();
  return t >= BFCM_STARTS_AT.getTime() && t <= BFCM_ENDS_AT.getTime();
}

/** Milliseconds left (0 once it is over, or before it starts). */
export function bfcmRemainingMs(now: Date = new Date()): number {
  return isBfcmActive(now) ? BFCM_ENDS_AT.getTime() - now.getTime() : 0;
}

/** What a workspace may buy in the offer right now (src/lib/ads/bfcm-server.ts; null when it isn't running). */
export interface BfcmState { endsAt: string; serverNow: string; unlockBought: boolean; unlockAvailable: boolean; annual: string[]; spotsLeft: number | null }

/** "4d 03h left" / "5h 12m left" / "12m 05s left"; empty when over. */
export function formatBfcmLeft(ms: number): string {
  if (ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h left`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m left`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s left`;
}

type Meta = Record<string, string | undefined> | null | undefined;
const isBfcm = (meta: Meta) => meta?.promo === BFCM_PROMO;

/** Credits a paid topup checkout grants (and a full refund claws back): the pack, plus the BFCM bonus on the $9 unlock. */
export function topupCreditsFor(pack: Pick<AdsTopupPack, "key" | "credits">, meta: Meta): number {
  return pack.credits + (pack.key === UNLOCK_PACK.key && isBfcm(meta) ? BFCM_UNLOCK_BONUS_CREDITS : 0);
}

/** Bonus credits for a paid invoice: only the first invoice of a BFCM annual subscription. */
export function bfcmAnnualBonusFor(meta: Meta, billingReason: string | null | undefined, annual: boolean, amountPaid: number): number {
  return isBfcm(meta) && annual && billingReason === "subscription_create" && amountPaid > 0 ? BFCM_ANNUAL_BONUS_CREDITS : 0;
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export interface BfcmAnnualView {
  plan: PromoAnnualPrice["plan"];
  name: string;
  price: string;
  /** 12 x the monthly price, the comparison figure. */
  twelveMonthly: string;
  saving: string;
  bonuses: string[];
}

/** Copy for the two annual offers, computed from billing-config (no invented numbers). */
export function bfcmAnnualViews(): BfcmAnnualView[] {
  return BFCM_ANNUAL_PRICES.map((b) => {
    const plan = getPlan(b.plan)!;
    const twelve = plan.priceCents * 12;
    const bonuses = [`Bonus: ${BFCM_ANNUAL_BONUS_CREDITS} extra credits for your own ads and videos, added on payment`, "Your yearly price stays the same when it renews. Cancel anytime online."];
    if (b.plan === "autopilot") bonuses.splice(1, 0, "Bonus: priority setup. Your Meta setup with us is booked ahead of monthly members");
    return {
      plan: b.plan,
      name: plan.displayName ?? plan.name,
      price: usd(b.priceCents),
      twelveMonthly: usd(twelve),
      saving: usd(twelve - b.priceCents),
      bonuses,
    };
  });
}

/** One line for the pricing pages. */
export function bfcmPricingLine(): string {
  const [dept, auto] = bfcmAnnualViews();
  return `Pay for a year and keep the difference: ${dept.name} ${dept.price}/year (12 monthly payments: ${dept.twelveMonthly}), ${auto.name} ${auto.price}/year (${auto.twelveMonthly}). Bonus credits included.`;
}

/** The BFCM $9 unlock, in words. */
export const BFCM_UNLOCK_LINE = `Unlock the rest of your pack for ${usd(UNLOCK_PACK.priceCents)}, once, and get ${UNLOCK_PACK.credits + BFCM_UNLOCK_BONUS_CREDITS} credits for ${UNLOCK_PACK.credits + BFCM_UNLOCK_BONUS_CREDITS} brand-new ads (normally ${UNLOCK_PACK.credits}). No subscription.`;
/** True: Checkout saves the card on the Stripe customer and shows it next time; nothing is charged without the buyer. */
export const CARD_SAVED_LINE = "Stripe keeps your card on file, so buying more later takes one tap. Nothing is charged unless you press buy.";

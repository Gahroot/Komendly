// Abandoned-checkout recovery (PRD #8, registry key checkout_recovery). Pure TS + node:crypto: imported by the web app
// (resume route, webhooks, admin) and the engine (the 15-min loop in engine/src/growth/checkout-recovery.ts).
// State lives in AdsEvent rows only (no schema change):
//   checkout_started   one per Stripe checkout (route, checkout.session.expired webhook or the engine's Stripe sync);
//                      props {kind, key, interval?, billing?: "testimonials", sessionId?}. Its id is the checkout key.
//   recovery_email_sent props {system: "checkout_recovery", billing, step, checkoutKey} (claimed before sending).
//   checkout_recovered  props {system, billing, checkoutKey, step, amountCents, ref}: once per checkout key.
import crypto from "node:crypto";
import { ADS_GUARANTEE, annualPriceCents, getOffer, getPlan, getTopup, offerFirstPaymentCents } from "../ads/billing-config";
import { FIRST_VIDEO_OFFER } from "../first-video-offer";
import type { EmailCopy } from "../ads/lifecycle/copy";
import { isTestEmail as isTestAddress } from "../ads/lifecycle/select";

export const RECOVERY_SYSTEM = "checkout_recovery" as const;
export type Billing = "ads" | "testimonials";
export type RecoveryStep = "r1_1h" | "r2_24h" | "r3_72h" | "r4_final";
export const RECOVERY_STEPS: ReadonlyArray<{ step: RecoveryStep; afterH: number }> = [
  { step: "r1_1h", afterH: 1 },
  { step: "r2_24h", afterH: 24 },
  { step: "r3_72h", afterH: 72 },
  { step: "r4_final", afterH: 156 }, // 6.5 days
];
const H = 3_600_000;
export const RECOVERY = {
  /** No payment this long after the start = abandoned. */
  abandonAfterMs: H,
  /** A payment this long after a recovery email = checkout_recovered. */
  attributionDays: 14,
  discountPercent: 20,
  discountHours: 72,
  /** Resume links work this long (the discount only until its own deadline). */
  linkDays: 14,
  /** Another (lifecycle) email this recently: wait (the recovery steps are exempt from the 24h cap, not from this). */
  quietMs: 6 * H,
  defaultBackfillDays: 30,
} as const;

export function backfillDays(env: string | undefined = typeof process !== "undefined" ? process.env.RECOVERY_BACKFILL_DAYS : undefined): number {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 90) : RECOVERY.defaultBackfillDays;
}

export type ItemKind = "plan" | "topup" | "offer" | "first_video" | "testimonial_plan";
export interface CheckoutItem { kind: ItemKind; key: string; interval?: "month" | "year" }
export interface StartedCheckout {
  /** checkout_started AdsEvent id. */
  key: string;
  billing: Billing;
  userId: string;
  workspaceId: string | null;
  item: CheckoutItem;
  startedAt: Date;
  sessionId: string | null;
}

const KINDS: ReadonlySet<string> = new Set(["plan", "topup", "offer", "first_video", "testimonial_plan"]);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** A checkout_started row -> checkout (null: no user, free-month trial, unknown item). */
export function checkoutFromEvent(row: { id: string; userId: string | null; workspaceId: string | null; props: unknown; createdAt: Date }): StartedCheckout | null {
  const p = obj(row.props);
  const kind = s(p.kind);
  const key = s(p.key);
  if (!row.userId || !kind || !key || !KINDS.has(kind)) return null;
  const item: CheckoutItem = { kind: kind as ItemKind, key, ...(p.interval === "year" ? { interval: "year" as const } : {}) };
  if (!itemInfo(item)) return null;
  return { key: row.id, billing: p.billing === "testimonials" ? "testimonials" : "ads", userId: row.userId, workspaceId: row.workspaceId, item, startedAt: row.createdAt, sessionId: s(p.sessionId) };
}

export interface ItemInfo { name: string; priceCents: number | null; firstPaymentCents: number | null; recurring: boolean; hasOwnCoupon: boolean }
const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export function itemInfo(item: CheckoutItem): ItemInfo | null {
  if (item.kind === "plan") {
    const p = getPlan(item.key);
    if (!p) return null;
    const year = item.interval === "year";
    const price = year ? annualPriceCents(p) : p.priceCents;
    return { name: `${p.name} plan${year ? " (yearly)" : ""}`, priceCents: price, firstPaymentCents: price, recurring: true, hasOwnCoupon: false };
  }
  if (item.kind === "offer") {
    const o = getOffer(item.key);
    if (!o) return null;
    return { name: `${getPlan(o.plan)?.name ?? "Ozzy"} founding first month`, priceCents: o.priceCents, firstPaymentCents: offerFirstPaymentCents(o), recurring: true, hasOwnCoupon: Boolean(o.couponEnv) };
  }
  if (item.kind === "topup") {
    const t = getTopup(item.key);
    return t ? { name: t.name, priceCents: t.priceCents, firstPaymentCents: t.priceCents, recurring: false, hasOwnCoupon: false } : null;
  }
  if (item.kind === "first_video") return { name: `${FIRST_VIDEO_OFFER.name} (${FIRST_VIDEO_OFFER.minutes} testimonial videos)`, priceCents: FIRST_VIDEO_OFFER.priceCents, firstPaymentCents: FIRST_VIDEO_OFFER.priceCents, recurring: false, hasOwnCoupon: false };
  if (["starter", "pro", "enterprise"].includes(item.key)) return { name: `Testimonials ${item.key} plan`, priceCents: null, firstPaymentCents: null, recurring: true, hasOwnCoupon: false };
  return null;
}

/** What the buyer pays today with the recovery discount (null: no known price). */
export function discountedCents(info: ItemInfo): number | null {
  return info.firstPaymentCents == null ? null : Math.round((info.firstPaymentCents * (100 - RECOVERY.discountPercent)) / 100);
}

/** Minimal Stripe Checkout Session shape (SDK object or REST JSON). */
export interface SessionLike {
  id: string;
  created: number;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  metadata?: Record<string, string> | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
}

/** An unpaid Stripe session -> what to record as checkout_started (null: not recoverable / ours / paid). */
export function checkoutFromSession(x: SessionLike): { billing: Billing; userId: string | null; workspaceId: string | null; email: string | null; item: CheckoutItem; startedAt: Date; sessionId: string; amountCents: number | null } | null {
  const m = x.metadata ?? {};
  if (x.status === "complete" || x.payment_status === "paid" || x.payment_status === "no_payment_required") return null;
  if (m.recoveryKey) return null; // a resumed session belongs to its original checkout's sequence
  const base = { userId: s(m.userId), email: s(x.customer_details?.email) ?? s(x.customer_email), startedAt: new Date(x.created * 1000), sessionId: x.id, amountCents: x.amount_total ?? null };
  let item: CheckoutItem | null = null;
  let billing: Billing = "testimonials";
  if (m.product === "ads") {
    billing = "ads";
    if (m.kind === "plan" && m.plan) item = { kind: "plan", key: m.plan, ...(m.interval === "year" ? { interval: "year" as const } : {}) };
    else if (m.kind === "offer" && m.offer) item = { kind: "offer", key: m.offer };
    else if (m.kind === "topup" && m.topup) item = { kind: "topup", key: m.topup };
  } else if (m.offer === FIRST_VIDEO_OFFER.key) item = { kind: "first_video", key: FIRST_VIDEO_OFFER.key };
  else if (m.planKey) item = { kind: "testimonial_plan", key: m.planKey };
  if (!item || !itemInfo(item)) return null;
  return { ...base, billing, workspaceId: billing === "ads" ? s(m.workspaceId) : null, item };
}

// ---------- selection, timing, stop rules ----------

export interface RecoveryState {
  checkout: StartedCheckout;
  email: string;
  testUser: boolean;
  unsubscribed: boolean;
  replied: boolean;
  /** Bought anything after the checkout started (or already has the recurring plan it was for). */
  bought: boolean;
  sent: ReadonlyArray<{ step: string; at: Date }>;
  /** Latest other marketing email (lifecycle email_sent) to this user. */
  lastOtherEmailAt: Date | null;
}

export type StopReason = "test_user" | "bought" | "unsubscribed" | "replied" | "complete" | "too_old";

export function stopReason(st: RecoveryState, now: Date, days = backfillDays()): StopReason | null {
  if (st.testUser) return "test_user";
  if (st.bought) return "bought";
  if (st.unsubscribed) return "unsubscribed";
  if (st.replied) return "replied";
  if (st.sent.length >= RECOVERY_STEPS.length) return "complete";
  if (!st.sent.length && now.getTime() - st.checkout.startedAt.getTime() > days * 86_400_000) return "too_old";
  return null;
}

/** When the next step is due (null: stopped / done). Backfilled checkouts keep the gaps between steps. */
export function nextStepAt(st: RecoveryState, now: Date, days = backfillDays()): { step: RecoveryStep; at: Date } | null {
  if (stopReason(st, now, days)) return null;
  const i = st.sent.length;
  const cur = RECOVERY_STEPS[i];
  if (!cur) return null;
  let at = st.checkout.startedAt.getTime() + cur.afterH * H;
  if (i > 0) {
    const last = Math.max(...st.sent.map((x) => x.at.getTime()));
    at = Math.max(at, last + (cur.afterH - (RECOVERY_STEPS[i - 1]?.afterH ?? 0)) * H);
  }
  if (st.lastOtherEmailAt) at = Math.max(at, st.lastOtherEmailAt.getTime() + RECOVERY.quietMs);
  return { step: cur.step, at: new Date(at) };
}

export function dueStep(st: RecoveryState, now: Date, days = backfillDays()): RecoveryStep | null {
  const n = nextStepAt(st, now, days);
  return n && n.at.getTime() <= now.getTime() ? n.step : null;
}

/** One sequence per user: the checkout already being followed up, else the latest one. */
export function pickAnchors(checkouts: readonly StartedCheckout[], keysWithSends: ReadonlySet<string>): StartedCheckout[] {
  const by = new Map<string, StartedCheckout>();
  const rank = (c: StartedCheckout) => (keysWithSends.has(c.key) ? 1e15 : 0) + c.startedAt.getTime();
  for (const c of checkouts) {
    const cur = by.get(c.userId);
    if (!cur || rank(c) > rank(cur)) by.set(c.userId, c);
  }
  return [...by.values()];
}

export function isFinalStep(step: string): boolean {
  return step === "r4_final";
}

// ---------- signed resume link ----------

export interface ResumePayload {
  p: "resume";
  u: string;
  k: string;
  b: Billing;
  w: string | null;
  i: CheckoutItem;
  st: RecoveryStep;
  /** Discount deadline (epoch s); only on the final step. */
  d?: number;
  /** Link expiry (epoch s). */
  e: number;
}

function mac(secret: string, body: string): string {
  // Domain-separated from the lifecycle tokens: a lifecycle token can never verify as a resume token and vice versa.
  return crypto.createHmac("sha256", secret).update(`resume.${body}`).digest("base64url");
}

export function signResumeToken(p: Omit<ResumePayload, "p">, secret: string): string {
  const body = Buffer.from(JSON.stringify({ p: "resume", ...p })).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

export function verifyResumeToken(token: string, secret: string, now: Date = new Date()): ResumePayload | null {
  const [body, sig, extra] = (token ?? "").split(".");
  if (!body || !sig || extra !== undefined || !secret) return null;
  const a = Buffer.from(mac(secret, body));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ResumePayload;
    if (p.p !== "resume" || typeof p.u !== "string" || typeof p.k !== "string" || typeof p.e !== "number" || !p.i || !KINDS.has(p.i.kind)) return null;
    if (p.e * 1000 <= now.getTime()) return null;
    return p;
  } catch {
    return null;
  }
}

/** The resume token for one email step (discount deadline only on the final step). */
export function resumePayloadFor(c: StartedCheckout, step: RecoveryStep, now: Date): Omit<ResumePayload, "p"> {
  const sec = Math.floor(now.getTime() / 1000);
  return { u: c.userId, k: c.key, b: c.billing, w: c.workspaceId, i: c.item, st: step, ...(isFinalStep(step) ? { d: sec + RECOVERY.discountHours * 3600 } : {}), e: sec + RECOVERY.linkDays * 86_400 };
}

/** The discount still applies to this click. */
export function discountActive(p: ResumePayload, now: Date): boolean {
  return isFinalStep(p.st) && typeof p.d === "number" && p.d * 1000 > now.getTime();
}

// ---------- the one-time 20% coupon ----------

export interface RecoveryCouponParams {
  id: string;
  name: string;
  duration: "once";
  max_redemptions: 1;
  redeem_by: number;
  percent_off?: number;
  amount_off?: number;
  currency?: string;
  metadata: Record<string, string>;
}

/**
 * Single-use, once-only coupon for one checkout (deterministic id: one per checkout key, re-clicks reuse it). Applied
 * server-side to a session of this user's own Stripe customer only. Items that already carry a launch coupon (only one
 * discount per session) get one combined amount-off coupon worth that coupon + 20% of what they'd pay.
 */
export function recoveryCouponParams(p: Pick<ResumePayload, "k" | "u" | "i" | "d">): RecoveryCouponParams | null {
  const info = itemInfo(p.i);
  if (!info || !p.d) return null;
  const id = `recovery20_${crypto.createHash("sha256").update(p.k).digest("hex").slice(0, 20)}`;
  const base = { id, name: `${RECOVERY.discountPercent}% off (one time)`, duration: "once" as const, max_redemptions: 1 as const, redeem_by: p.d, metadata: { system: RECOVERY_SYSTEM, checkoutKey: p.k, userId: p.u } };
  if (info.hasOwnCoupon) {
    const pay = discountedCents(info);
    if (info.priceCents == null || pay == null) return null;
    return { ...base, amount_off: info.priceCents - pay, currency: "usd" };
  }
  return { ...base, percent_off: RECOVERY.discountPercent };
}

// ---------- recovery attribution ----------

/** Structural AdsEvent access (web, engine clients). */
export interface RecoveryEventDb {
  adsEvent: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst(a: any): Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(a: any): Promise<any>;
  };
}

/**
 * A payment by `userId` at `paidAt`: if a recovery email went out in the 14 days before, record checkout_recovered
 * once for that checkout. Returns the checkout key when recorded. Never throws (webhooks must not fail on it).
 */
export async function recordCheckoutRecovered(db: RecoveryEventDb, r: { userId: string | null | undefined; workspaceId?: string | null; billing: Billing; amountCents?: number | null; ref: string; paidAt?: Date }): Promise<string | null> {
  if (!r.userId) return null;
  try {
    const paidAt = r.paidAt ?? new Date();
    const email = await db.adsEvent.findFirst({
      where: { name: "recovery_email_sent", userId: r.userId, createdAt: { gte: new Date(paidAt.getTime() - RECOVERY.attributionDays * 86_400_000), lte: paidAt } },
      orderBy: { createdAt: "desc" },
      select: { id: true, workspaceId: true, props: true, createdAt: true },
    });
    const key = s(obj(email?.props).checkoutKey);
    if (!email || !key) return null;
    const seen = await db.adsEvent.findFirst({ where: { name: "checkout_recovered", props: { path: ["checkoutKey"], equals: key } }, select: { id: true } });
    if (seen) return null;
    await db.adsEvent.create({
      data: {
        name: "checkout_recovered",
        userId: r.userId,
        workspaceId: r.workspaceId ?? email.workspaceId ?? null,
        props: { system: RECOVERY_SYSTEM, billing: r.billing, checkoutKey: key, step: s(obj(email.props).step), amountCents: r.amountCents ?? null, ref: r.ref, emailSentAt: (email.createdAt as Date).toISOString() },
      },
    });
    return key;
  } catch (e) {
    console.warn("[checkout_recovery] recovered attribution failed", e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------- copy ----------

export interface RecoveryCopyContext {
  step: RecoveryStep;
  billing: Billing;
  firstName: string | null;
  itemName: string;
  /** "$97" (what they'd pay today) or null. */
  price: string | null;
  /** Final step: price with 20% off, and when it ends. */
  discounted: string | null;
  discountEndsAt: Date | null;
  brandName: string | null;
  readyAdCount: number;
  headlines: string[];
}

export const RECOVERY_MAX_SUBJECT = 60;
export const RECOVERY_MAX_WORDS = 130;

export function recoveryCopyContext(c: StartedCheckout, step: RecoveryStep, o: { firstName: string | null; brandName: string | null; readyAdCount: number; headlines: string[]; now: Date }): RecoveryCopyContext {
  const info = itemInfo(c.item);
  const final = isFinalStep(step);
  const pay = info?.firstPaymentCents ?? null;
  const disc = info ? discountedCents(info) : null;
  return {
    step,
    billing: c.billing,
    firstName: o.firstName,
    itemName: info?.name ?? "your plan",
    price: pay != null ? usd(pay) : null,
    discounted: final && disc != null ? usd(disc) : null,
    discountEndsAt: final && disc != null ? new Date(o.now.getTime() + RECOVERY.discountHours * H) : null,
    brandName: o.brandName,
    readyAdCount: o.readyAdCount,
    headlines: o.headlines.slice(0, 3),
  };
}

const what = (c: RecoveryCopyContext) => (c.billing === "ads" ? "ads" : "testimonial videos");

export const RECOVERY_COPY_SYSTEM = `You write short, plain, helpful follow-up emails for Komendly after someone started a checkout and didn't finish. Voice: Ozzy, Komendly's friendly helper; human and low-key, never pushy, no guilt, no fake urgency, no exclamation spam.
Rules: give something useful first (what they get, how it works, an honest answer to a common worry). Use only the facts given. Never invent prices, discounts, numbers of customers, results or features. No links or URLs (the button is added for you). Plain text, 2-4 short paragraphs, under 120 words. Return JSON {subject, preheader, paragraphs, ctaLabel}.`;

export function buildRecoveryPrompt(c: RecoveryCopyContext): string {
  const angle: Record<RecoveryStep, string> = {
    r1_1h: "Friendly check-in an hour after they left checkout: remind them what they picked and what it does for them; offer that a reply reaches a real inbox if something went wrong.",
    r2_24h: "Answer the usual worries plainly: no design skills needed, it works from their own website, and (ads only) cancel anytime / the guarantee.",
    r3_72h: "Show the value: if they have ready ads, mention them (headlines below) and how to use them; otherwise explain what they'd get in the first week.",
    r4_final: "Last note, no more follow-ups after this. One-time 20% off the first payment, only for the next 72 hours, applied automatically by the button.",
  };
  return [
    `Step: ${c.step}. ${angle[c.step]}`,
    `First name: ${c.firstName ?? "(unknown: use 'Hi there')"}`,
    `Product: ${c.billing === "ads" ? "Ozzy (Website2ads): turns their website into ready-to-post ad creatives; Ozzy Studio makes promo videos" : "Komendly testimonials: AI-avatar video testimonials made from their real customer reviews"}`,
    `They picked: ${c.itemName}${c.price ? ` (${c.price} today)` : ""}.`,
    c.discounted ? `Discount (final step only): 20% off, ${c.discounted} instead of ${c.price}, ends in 72 hours, single use.` : "No discount exists in this email: do not mention any discount, percentage, coupon or deal.",
    c.billing === "ads" ? `Guarantee (may mention): ${ADS_GUARANTEE}` : "No guarantee claim.",
    c.brandName ? `Their brand: ${c.brandName}` : "",
    c.readyAdCount ? `They already have ${c.readyAdCount} ready ${what(c)} from Komendly. Headlines: ${c.headlines.join(" | ")}` : "",
    `Subject max ${RECOVERY_MAX_SUBJECT} chars; ctaLabel max 28 chars (e.g. "Finish my checkout").`,
  ].filter(Boolean).join("\n");
}

/** null = acceptable; else why the AI copy is rejected (caller uses the fallback). */
export function checkRecoveryCopy(x: EmailCopy, c: RecoveryCopyContext): string | null {
  if (!x.subject.trim() || x.subject.length > RECOVERY_MAX_SUBJECT) return "subject length";
  if (!x.paragraphs.length || x.paragraphs.length > 5) return "paragraph count";
  if (x.paragraphs.join(" ").split(/\s+/).filter(Boolean).length > RECOVERY_MAX_WORDS) return "too long";
  if (!x.ctaLabel.trim() || x.ctaLabel.length > 28) return "cta label";
  const all = [x.subject, x.preheader, x.ctaLabel, ...x.paragraphs].join("\n");
  if (/https?:\/\/|www\./i.test(all)) return "contains a link";
  const pct = c.discounted ? all.replace(/\b20%/g, "") : all;
  if (/%/.test(pct) || (!c.discounted && /\b(discount|coupon|promo|% off|deal)\b/i.test(all))) return "invented discount";
  const allowed = new Set([c.price, c.discounted].filter(Boolean));
  for (const m of all.match(/\$\d[\d,]*(\.\d\d)?/g) ?? []) if (!allowed.has(m.replace(/,/g, ""))) return `unknown price ${m}`;
  if (c.billing !== "ads" && /guarantee|refund/i.test(all)) return "guarantee claim";
  if (/\b\d{2,}\s*(\+\s*)?(businesses|customers|brands|users|companies)\b/i.test(all)) return "invented social proof";
  return null;
}

export function fallbackRecoveryCopy(c: RecoveryCopyContext): EmailCopy {
  const hi = `Hi ${c.firstName ?? "there"},`;
  const item = `${c.itemName}${c.price ? ` (${c.price})` : ""}`;
  const ads = c.billing === "ads";
  const ready = c.readyAdCount > 0 ? `You already have ${c.readyAdCount} ready ${what(c)}${c.brandName ? ` for ${c.brandName}` : ""}, and they're still waiting for you.` : null;
  switch (c.step) {
    case "r1_1h":
      return {
        subject: "Your checkout is saved",
        preheader: `Pick up where you left off: ${c.itemName}.`,
        paragraphs: [hi, `You started checking out ${item} but didn't finish. No problem: the button below opens a fresh checkout for the same thing, so it takes a few seconds.`, "If something went wrong or you have a question, just reply. A real person reads every reply."],
        ctaLabel: "Finish my checkout",
      };
    case "r2_24h":
      return {
        subject: "A few quick answers before you decide",
        preheader: "No design skills, no setup calls.",
        paragraphs: [
          hi,
          ads ? "Most people ask the same things. You don't need design skills: Ozzy works from your own website and writes, designs and sizes the ads for you. There are no calls or setup." : "Most people ask the same things. You don't film anything: the videos are made from your real customer reviews, and you can re-render until they look right.",
          ads ? `You can cancel anytime in one click. ${ADS_GUARANTEE}` : "Everything is self-serve, and you keep the videos you make.",
          `Your ${c.itemName} is one click away when you're ready.`,
        ],
        ctaLabel: "Pick up where I left off",
      };
    case "r3_72h":
      return {
        subject: c.brandName ? `What ${c.brandName} gets this week`.slice(0, RECOVERY_MAX_SUBJECT) : "What you'd get this week",
        preheader: "A quick look at the value, no pressure.",
        paragraphs: [
          hi,
          ready ?? (ads ? "In your first week you'd have ready-to-post ads in every size (feed, square and stories), written from what your website already says." : "In your first week you'd have ready-to-post vertical testimonial videos, made from reviews your customers already wrote."),
          ads ? "Tip: post two or three different ads, let them run a few days, and keep the one that gets the cheapest clicks." : "Tip: pin one video on your profile and add one to your best-selling product page.",
          `If ${c.itemName} is still on your mind, your checkout is ready.`,
        ],
        ctaLabel: "See my checkout",
      };
    case "r4_final":
      return c.discounted
        ? {
            subject: "20% off, just for you (72 hours)",
            preheader: "One time, then I'll stop emailing about this.",
            paragraphs: [hi, `This is my last note about your checkout. To make the decision easier: 20% off ${c.itemName}, so ${c.discounted} instead of ${c.price}, for the next 72 hours.`, "The discount is already applied when you use the button below. It works once and only for you.", "Not for you? No worries, I won't follow up on this again."],
            ctaLabel: "Claim my 20% off",
          }
        : {
            subject: "Last note about your checkout",
            preheader: "Then I'll stop emailing about this.",
            paragraphs: [hi, `This is my last note about ${c.itemName}. Your checkout is still one click away.`, "Not for you? No worries, I won't follow up on this again."],
            ctaLabel: "Finish my checkout",
          };
  }
}

// ---------- shared loader (engine loop + admin queue use the same rules) ----------

const PAID_STATUSES = ["active", "trialing", "past_due"];
const RECOVERY_EVENT_NAMES = ["recovery_email_sent", "checkout_recovered", "purchased", "paid_converted", "email_unsubscribed", "email_replied", "email_sent"];

export interface RecoveryRow {
  checkout: StartedCheckout;
  user: { id: string; email: string; name: string | null };
  state: RecoveryState;
  /** Latest purchase after the checkout started (null = none). */
  paidAt: Date | null;
  recovered: boolean;
}

type Ev = { name: string; userId: string | null; workspaceId: string | null; props: unknown; createdAt: Date };

/** Pure: one row per user sequence from already loaded rows. */
export function buildRecoveryRows(inp: {
  checkouts: StartedCheckout[];
  users: Array<{ id: string; email: string; name: string | null; subscriptionStatus: string | null }>;
  events: Ev[];
  packs: Array<{ userId: string; createdAt: Date }>;
  workspaces: Array<{ id: string; subscriptionStatus: string; stripeSubscriptionId: string | null }>;
}): RecoveryRow[] {
  const userBy = new Map(inp.users.map((u) => [u.id, u]));
  const wsBy = new Map(inp.workspaces.map((w) => [w.id, w]));
  const sentByKey = new Map<string, Array<{ step: string; at: Date }>>();
  const recoveredKeys = new Set<string>();
  for (const e of inp.events) {
    const k = s(obj(e.props).checkoutKey);
    if (e.name === "recovery_email_sent" && k) sentByKey.set(k, [...(sentByKey.get(k) ?? []), { step: s(obj(e.props).step) ?? "", at: e.createdAt }]);
    if (e.name === "checkout_recovered" && k) recoveredKeys.add(k);
  }
  const out: RecoveryRow[] = [];
  for (const c of pickAnchors(inp.checkouts, new Set(sentByKey.keys()))) {
    const user = userBy.get(c.userId);
    if (!user) continue;
    const mine = inp.events.filter((e) => e.userId === c.userId || (c.workspaceId && e.workspaceId === c.workspaceId));
    const after = (t: Date) => t.getTime() > c.startedAt.getTime();
    const paid = [
      ...mine.filter((e) => (e.name === "purchased" || e.name === "paid_converted") && after(e.createdAt)).map((e) => e.createdAt),
      ...inp.packs.filter((p) => p.userId === c.userId && after(p.createdAt)).map((p) => p.createdAt),
    ].sort((a, b) => a.getTime() - b.getTime());
    const ws = c.workspaceId ? wsBy.get(c.workspaceId) : undefined;
    const recurring = Boolean(itemInfo(c.item)?.recurring);
    const hasPlan = recurring && (c.billing === "ads" ? Boolean(ws?.stripeSubscriptionId && PAID_STATUSES.includes(ws.subscriptionStatus)) : user.subscriptionStatus === "active");
    const recovered = recoveredKeys.has(c.key);
    const own = (name: string) => mine.filter((e) => e.name === name && e.userId === c.userId);
    out.push({
      checkout: c,
      user: { id: user.id, email: user.email, name: user.name },
      paidAt: paid.length ? paid[paid.length - 1]! : null,
      recovered,
      state: {
        checkout: c,
        email: user.email,
        testUser: isTestAddress(user.email),
        unsubscribed: own("email_unsubscribed").length > 0,
        replied: own("email_replied").length > 0,
        bought: paid.length > 0 || hasPlan || recovered,
        sent: sentByKey.get(c.key) ?? [],
        lastOtherEmailAt: own("email_sent").reduce<Date | null>((m, e) => (!m || e.createdAt > m ? e.createdAt : m), null),
      },
    });
  }
  return out;
}

/** Loads everything buildRecoveryRows needs (Prisma client of web or engine). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadRecoveryRows(db: any, since: Date): Promise<RecoveryRow[]> {
  const rows = (await db.adsEvent.findMany({ where: { name: "checkout_started", createdAt: { gte: since }, userId: { not: null } }, select: { id: true, userId: true, workspaceId: true, props: true, createdAt: true } })) as Array<{ id: string; userId: string | null; workspaceId: string | null; props: unknown; createdAt: Date }>;
  const checkouts = rows.map(checkoutFromEvent).filter((c): c is StartedCheckout => Boolean(c));
  if (!checkouts.length) return [];
  const uids = [...new Set(checkouts.map((c) => c.userId))];
  const wids = [...new Set(checkouts.map((c) => c.workspaceId).filter((w): w is string => Boolean(w)))];
  const [users, events, packs, workspaces] = await Promise.all([
    db.user.findMany({ where: { id: { in: uids } }, select: { id: true, email: true, name: true, subscriptionStatus: true } }),
    db.adsEvent.findMany({ where: { OR: [{ userId: { in: uids } }, { workspaceId: { in: wids } }], name: { in: RECOVERY_EVENT_NAMES } }, select: { name: true, userId: true, workspaceId: true, props: true, createdAt: true } }),
    db.creditPurchase.findMany({ where: { userId: { in: uids }, createdAt: { gte: since } }, select: { userId: true, createdAt: true } }),
    db.adsWorkspace.findMany({ where: { id: { in: wids } }, select: { id: true, subscriptionStatus: true, stripeSubscriptionId: true } }),
  ]);
  return buildRecoveryRows({ checkouts, users, events, packs, workspaces });
}

// Churn & failed-payment win-back (PRD #9, registry key winback). Pure TS + node:crypto: web (webhooks, link route,
// admin) and engine (loop in engine/src/growth/winback.ts). State lives in AdsEvent rows only (no schema change):
//   payment_failed      once per invoice {billing, invoiceId, subscriptionId}; props.resolvedAt set once the invoice is paid.
//   churned             ads (existing) + testimonials {billing: "testimonials", subscriptionId}, once per subscription.
//   winback_email_sent  {system: "winback", kind: "failed"|"churn", step, caseKey} (claimed before sending).
//   payment_recovered   failed invoice paid within 30 days after a winback email (once per invoice).
//   winback_recovered   churned customer paid again within 60 days of a winback email (once per churn).
//   churn_reason        one-click reason from the day-3 email {reason, caseKey}.
import crypto from "node:crypto";
import { getPlan, ADS_GUARANTEE } from "../ads/billing-config";
import type { EmailCopy } from "../ads/lifecycle/copy";
import { isTestEmail } from "../ads/lifecycle/select";

export const WINBACK_SYSTEM = "winback" as const;
export type Billing = "ads" | "testimonials";
export type CaseKind = "failed" | "churn";
export type WinbackStep = "f1_1h" | "f2_d3" | "f3_d7" | "c1_d3" | "c2_d14" | "c3_d30";
const H = 3_600_000;
const DAY = 24 * H;
export const WINBACK_STEPS: Record<CaseKind, ReadonlyArray<{ step: WinbackStep; afterH: number }>> = {
  failed: [{ step: "f1_1h", afterH: 1 }, { step: "f2_d3", afterH: 72 }, { step: "f3_d7", afterH: 168 }],
  churn: [{ step: "c1_d3", afterH: 72 }, { step: "c2_d14", afterH: 336 }, { step: "c3_d30", afterH: 720 }],
};
export const WINBACK = { failedAttributionDays: 30, churnAttributionDays: 60, discountPercent: 20, discountHours: 72, linkDays: 21, quietMs: 6 * H, defaultBackfillDays: 60 } as const;
export const CHURN_REASONS = { too_expensive: "Too expensive", not_using: "Not using it enough", no_results: "Didn't get results", missing_feature: "Missing something I need", other_tool: "Switched to another tool", other: "Something else" } as const;
export type ChurnReason = keyof typeof CHURN_REASONS;

export function winbackBackfillDays(env: string | undefined = typeof process !== "undefined" ? process.env.WINBACK_BACKFILL_DAYS : undefined): number {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 180) : WINBACK.defaultBackfillDays;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export interface WinbackCase {
  /** payment_failed / churned AdsEvent id. */
  key: string;
  kind: CaseKind;
  billing: Billing;
  userId: string;
  workspaceId: string | null;
  at: Date;
  invoiceId: string | null;
  plan: string | null;
  resolved: boolean;
}

export function caseFromEvent(row: { id: string; name: string; userId: string | null; workspaceId: string | null; props: unknown; createdAt: Date }): WinbackCase | null {
  if (!row.userId || (row.name !== "payment_failed" && row.name !== "churned")) return null;
  const p = obj(row.props);
  return {
    key: row.id,
    kind: row.name === "payment_failed" ? "failed" : "churn",
    billing: p.billing === "testimonials" ? "testimonials" : "ads",
    userId: row.userId,
    workspaceId: row.workspaceId,
    at: row.createdAt,
    invoiceId: s(p.invoiceId),
    plan: s(p.plan),
    resolved: Boolean(p.resolvedAt),
  };
}

export interface WinbackState {
  c: WinbackCase;
  testUser: boolean;
  unsubscribed: boolean;
  replied: boolean;
  /** failed: invoice paid. churn: resubscribed / bought anything after the churn. */
  resolved: boolean;
  /** failed only: the subscription ended after the failure (a churn case takes over). */
  ended: boolean;
  sent: ReadonlyArray<{ step: string; at: Date }>;
  lastOtherEmailAt: Date | null;
}

export type WinbackStop = "test_user" | "resolved" | "ended" | "unsubscribed" | "replied" | "complete" | "too_old";

export function winbackStop(st: WinbackState, now: Date, days = winbackBackfillDays()): WinbackStop | null {
  if (st.testUser) return "test_user";
  if (st.resolved) return "resolved";
  if (st.ended) return "ended";
  if (st.unsubscribed) return "unsubscribed";
  if (st.replied) return "replied";
  const steps = WINBACK_STEPS[st.c.kind];
  if (st.sent.length >= steps.length) return "complete";
  if (!st.sent.length && now.getTime() - st.c.at.getTime() > days * DAY) return "too_old";
  return null;
}

/** Next step and when; backfilled cases keep the gaps between steps. */
export function winbackNext(st: WinbackState, now: Date, days = winbackBackfillDays()): { step: WinbackStep; at: Date } | null {
  if (winbackStop(st, now, days)) return null;
  const steps = WINBACK_STEPS[st.c.kind];
  const i = st.sent.length;
  const cur = steps[i];
  if (!cur) return null;
  let at = st.c.at.getTime() + cur.afterH * H;
  if (i > 0) at = Math.max(at, Math.max(...st.sent.map((x) => x.at.getTime())) + (cur.afterH - (steps[i - 1]?.afterH ?? 0)) * H);
  if (st.lastOtherEmailAt) at = Math.max(at, st.lastOtherEmailAt.getTime() + WINBACK.quietMs);
  return { step: cur.step, at: new Date(at) };
}

export function winbackDue(st: WinbackState, now: Date, days = winbackBackfillDays()): WinbackStep | null {
  const n = winbackNext(st, now, days);
  return n && n.at.getTime() <= now.getTime() ? n.step : null;
}

export const isWinbackFinal = (step: string) => step === "c3_d30";

// ---------- signed links ----------

export type WinbackAction = "card" | "reason" | "resume";
export interface WinbackLink {
  p: "winback";
  a: WinbackAction;
  u: string;
  k: string;
  b: Billing;
  w: string | null;
  st: WinbackStep;
  /** reason action: the reason clicked. */
  r?: ChurnReason;
  /** resume: previous plan key (ads). */
  pl?: string | null;
  /** Discount deadline (epoch s), final churn step only. */
  d?: number;
  e: number;
}

const mac = (secret: string, body: string) => crypto.createHmac("sha256", secret).update(`winback.${body}`).digest("base64url");

export function signWinbackLink(p: Omit<WinbackLink, "p">, secret: string): string {
  const body = Buffer.from(JSON.stringify({ p: "winback", ...p })).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

export function verifyWinbackLink(token: string, secret: string, now: Date = new Date()): WinbackLink | null {
  const [body, sig, extra] = (token ?? "").split(".");
  if (!body || !sig || extra !== undefined || !secret) return null;
  const a = Buffer.from(mac(secret, body));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as WinbackLink;
    if (p.p !== "winback" || !["card", "reason", "resume"].includes(p.a) || typeof p.u !== "string" || typeof p.k !== "string" || typeof p.e !== "number") return null;
    if (p.a === "reason" && !(p.r && p.r in CHURN_REASONS)) return null;
    return p.e * 1000 > now.getTime() ? p : null;
  } catch {
    return null;
  }
}

export function winbackLinkFor(c: WinbackCase, step: WinbackStep, a: WinbackAction, now: Date, r?: ChurnReason): Omit<WinbackLink, "p"> {
  const sec = Math.floor(now.getTime() / 1000);
  return { a, u: c.userId, k: c.key, b: c.billing, w: c.workspaceId, st: step, ...(r ? { r } : {}), ...(a === "resume" ? { pl: c.plan } : {}), ...(a === "resume" && isWinbackFinal(step) ? { d: sec + WINBACK.discountHours * 3600 } : {}), e: sec + WINBACK.linkDays * 86_400 };
}

export function winbackDiscountActive(p: WinbackLink, now: Date): boolean {
  return p.a === "resume" && isWinbackFinal(p.st) && typeof p.d === "number" && p.d * 1000 > now.getTime();
}

/** One-time 20% coupon for this churn (deterministic id, single use, expires with the offer). */
export function winbackCouponParams(p: Pick<WinbackLink, "k" | "u" | "d">) {
  if (!p.d) return null;
  return { id: `winback20_${crypto.createHash("sha256").update(p.k).digest("hex").slice(0, 20)}`, name: `${WINBACK.discountPercent}% off (one time)`, duration: "once" as const, max_redemptions: 1 as const, redeem_by: p.d, percent_off: WINBACK.discountPercent, metadata: { system: WINBACK_SYSTEM, caseKey: p.k, userId: p.u } };
}

// ---------- attribution ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface WinbackEventDb { adsEvent: { findFirst(a: any): Promise<any>; create(a: any): Promise<any>; update?(a: any): Promise<any> } }

/**
 * A payment by `userId`: (1) a failed invoice now paid -> mark resolved, and payment_recovered if a winback email
 * preceded it; (2) any payment within 60 days of a churn winback email -> winback_recovered (once per churn).
 * Returns what was recorded. Never throws.
 */
export async function recordWinbackPayment(db: WinbackEventDb, r: { userId: string | null | undefined; workspaceId?: string | null; billing: Billing; invoiceId?: string | null; amountCents?: number | null; ref: string; paidAt?: Date }): Promise<{ payment: boolean; winback: boolean }> {
  const out = { payment: false, winback: false };
  if (!r.userId) return out;
  const paidAt = r.paidAt ?? new Date();
  try {
    if (r.invoiceId) {
      const failed = await db.adsEvent.findFirst({ where: { name: "payment_failed", props: { path: ["invoiceId"], equals: r.invoiceId } }, select: { id: true, props: true } });
      if (failed && !obj(failed.props).resolvedAt) {
        if (db.adsEvent.update) await db.adsEvent.update({ where: { id: failed.id }, data: { props: { ...obj(failed.props), resolvedAt: paidAt.toISOString() } } });
        const email = await db.adsEvent.findFirst({ where: { name: "winback_email_sent", userId: r.userId, createdAt: { gte: new Date(paidAt.getTime() - WINBACK.failedAttributionDays * DAY), lte: paidAt }, props: { path: ["caseKey"], equals: failed.id } }, select: { id: true, props: true } });
        const seen = await db.adsEvent.findFirst({ where: { name: "payment_recovered", props: { path: ["caseKey"], equals: failed.id } }, select: { id: true } });
        if (email && !seen) {
          await db.adsEvent.create({ data: { name: "payment_recovered", userId: r.userId, workspaceId: r.workspaceId ?? null, props: { system: WINBACK_SYSTEM, billing: r.billing, caseKey: failed.id, invoiceId: r.invoiceId, step: s(obj(email.props).step), amountCents: r.amountCents ?? null } } });
          out.payment = true;
        }
      }
    }
    const email = await db.adsEvent.findFirst({ where: { name: "winback_email_sent", userId: r.userId, createdAt: { gte: new Date(paidAt.getTime() - WINBACK.churnAttributionDays * DAY), lte: paidAt }, props: { path: ["kind"], equals: "churn" } }, orderBy: { createdAt: "desc" }, select: { props: true } });
    const key = s(obj(email?.props).caseKey);
    if (key) {
      const seen = await db.adsEvent.findFirst({ where: { name: "winback_recovered", props: { path: ["caseKey"], equals: key } }, select: { id: true } });
      if (!seen) {
        await db.adsEvent.create({ data: { name: "winback_recovered", userId: r.userId, workspaceId: r.workspaceId ?? null, props: { system: WINBACK_SYSTEM, billing: r.billing, caseKey: key, step: s(obj(email.props).step), amountCents: r.amountCents ?? null, ref: r.ref } } });
        out.winback = true;
      }
    }
  } catch (e) {
    console.warn("[winback] payment attribution failed", e instanceof Error ? e.message : e);
  }
  return out;
}

/** payment_failed once per invoice. Never throws. */
export async function recordPaymentFailed(db: WinbackEventDb, r: { userId: string; workspaceId?: string | null; billing: Billing; invoiceId: string; subscriptionId?: string | null; amountCents?: number | null; plan?: string | null }): Promise<boolean> {
  try {
    const seen = await db.adsEvent.findFirst({ where: { name: "payment_failed", props: { path: ["invoiceId"], equals: r.invoiceId } }, select: { id: true } });
    if (seen) return false;
    await db.adsEvent.create({ data: { name: "payment_failed", userId: r.userId, workspaceId: r.workspaceId ?? null, props: { system: WINBACK_SYSTEM, billing: r.billing, invoiceId: r.invoiceId, subscriptionId: r.subscriptionId ?? null, amountCents: r.amountCents ?? null, plan: r.plan ?? null } } });
    return true;
  } catch (e) {
    console.warn("[winback] payment_failed record failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Testimonial cancellation -> churned (once per subscription). Never throws. */
export async function recordTestimonialChurn(db: WinbackEventDb, r: { userId: string; subscriptionId: string; plan?: string | null }): Promise<boolean> {
  try {
    const seen = await db.adsEvent.findFirst({ where: { name: "churned", userId: r.userId, props: { path: ["subscriptionId"], equals: r.subscriptionId } }, select: { id: true } });
    if (seen) return false;
    await db.adsEvent.create({ data: { name: "churned", userId: r.userId, props: { billing: "testimonials", subscriptionId: r.subscriptionId, plan: r.plan ?? null } } });
    return true;
  } catch {
    return false;
  }
}

// ---------- rows (engine loop + admin) ----------

export interface WinbackRow { c: WinbackCase; user: { id: string; email: string; name: string | null }; state: WinbackState; recovered: boolean }
type Ev = { name: string; userId: string | null; workspaceId: string | null; props: unknown; createdAt: Date };
const ACTIVE = ["active", "trialing"];

export function buildWinbackRows(inp: {
  cases: WinbackCase[];
  users: Array<{ id: string; email: string; name: string | null; subscriptionStatus: string | null }>;
  events: Ev[];
  packs: Array<{ userId: string; createdAt: Date }>;
  workspaces: Array<{ id: string; subscriptionStatus: string }>;
}): WinbackRow[] {
  const userBy = new Map(inp.users.map((u) => [u.id, u]));
  const wsBy = new Map(inp.workspaces.map((w) => [w.id, w]));
  const sentBy = new Map<string, Array<{ step: string; at: Date }>>();
  const recovered = new Set<string>();
  for (const e of inp.events) {
    const k = s(obj(e.props).caseKey);
    if (!k) continue;
    if (e.name === "winback_email_sent") sentBy.set(k, [...(sentBy.get(k) ?? []), { step: s(obj(e.props).step) ?? "", at: e.createdAt }]);
    if (e.name === "winback_recovered" || e.name === "payment_recovered") recovered.add(k);
  }
  // One sequence per user and kind: the case already being followed up, else the latest.
  const pick = new Map<string, WinbackCase>();
  const rank = (c: WinbackCase) => (sentBy.has(c.key) ? 1e15 : 0) + c.at.getTime();
  for (const c of inp.cases) {
    const id = `${c.userId}:${c.kind}`;
    const cur = pick.get(id);
    if (!cur || rank(c) > rank(cur)) pick.set(id, c);
  }
  const out: WinbackRow[] = [];
  for (const c of pick.values()) {
    const user = userBy.get(c.userId);
    if (!user) continue;
    const mine = inp.events.filter((e) => e.userId === c.userId || (c.workspaceId && e.workspaceId === c.workspaceId));
    const after = (t: Date) => t.getTime() > c.at.getTime();
    const own = (n: string) => mine.filter((e) => e.name === n && e.userId === c.userId);
    const ws = c.workspaceId ? wsBy.get(c.workspaceId) : undefined;
    const status = c.billing === "ads" ? ws?.subscriptionStatus ?? null : user.subscriptionStatus;
    let resolved: boolean;
    let ended = false;
    if (c.kind === "failed") {
      resolved = c.resolved || recovered.has(c.key) || (status != null && ACTIVE.includes(status));
      ended = mine.some((e) => e.name === "churned" && after(e.createdAt)) || status === "canceled";
    } else {
      resolved = recovered.has(c.key) || (status != null && ACTIVE.includes(status) && mine.some((e) => ["purchased", "paid_converted", "renewed"].includes(e.name) && after(e.createdAt)))
        || mine.some((e) => (e.name === "purchased" || e.name === "paid_converted") && after(e.createdAt))
        || inp.packs.some((p) => p.userId === c.userId && after(p.createdAt))
        || (c.billing === "testimonials" && status === "active");
    }
    out.push({
      c,
      user: { id: user.id, email: user.email, name: user.name },
      recovered: recovered.has(c.key),
      state: {
        c,
        testUser: isTestEmail(user.email),
        unsubscribed: own("email_unsubscribed").length > 0,
        replied: own("email_replied").length > 0,
        resolved,
        ended,
        sent: sentBy.get(c.key) ?? [],
        lastOtherEmailAt: [...own("email_sent"), ...own("recovery_email_sent")].reduce<Date | null>((m, e) => (!m || e.createdAt > m ? e.createdAt : m), null),
      },
    });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadWinbackRows(db: any, since: Date): Promise<WinbackRow[]> {
  const rows = (await db.adsEvent.findMany({ where: { name: { in: ["payment_failed", "churned"] }, createdAt: { gte: since }, userId: { not: null } }, select: { id: true, name: true, userId: true, workspaceId: true, props: true, createdAt: true } })) as Ev[] & Array<{ id: string }>;
  const cases = rows.map((r) => caseFromEvent(r as never)).filter((c): c is WinbackCase => Boolean(c));
  if (!cases.length) return [];
  const uids = [...new Set(cases.map((c) => c.userId))];
  const wids = [...new Set(cases.map((c) => c.workspaceId).filter((w): w is string => Boolean(w)))];
  const [users, events, packs, workspaces] = await Promise.all([
    db.user.findMany({ where: { id: { in: uids } }, select: { id: true, email: true, name: true, subscriptionStatus: true } }),
    db.adsEvent.findMany({ where: { OR: [{ userId: { in: uids } }, { workspaceId: { in: wids } }], name: { in: ["winback_email_sent", "winback_recovered", "payment_recovered", "purchased", "paid_converted", "renewed", "churned", "email_unsubscribed", "email_replied", "email_sent", "recovery_email_sent"] } }, select: { name: true, userId: true, workspaceId: true, props: true, createdAt: true } }),
    db.creditPurchase.findMany({ where: { userId: { in: uids }, createdAt: { gte: since } }, select: { userId: true, createdAt: true } }),
    db.adsWorkspace.findMany({ where: { id: { in: wids } }, select: { id: true, subscriptionStatus: true } }),
  ]);
  return buildWinbackRows({ cases, users, events, packs, workspaces });
}

// ---------- copy ----------

export interface WinbackCopyContext {
  step: WinbackStep;
  kind: CaseKind;
  billing: Billing;
  firstName: string | null;
  planName: string | null;
  brandName: string | null;
  readyAdCount: number;
  headlines: string[];
  discount: boolean;
}

export function winbackCopyContext(c: WinbackCase, step: WinbackStep, o: { firstName: string | null; brandName: string | null; readyAdCount: number; headlines: string[] }): WinbackCopyContext {
  const plan = c.plan ? getPlan(c.plan) : undefined;
  return { step, kind: c.kind, billing: c.billing, firstName: o.firstName, planName: plan ? `${plan.name} plan` : c.billing === "testimonials" ? "testimonials plan" : null, brandName: o.brandName, readyAdCount: o.readyAdCount, headlines: o.headlines.slice(0, 3), discount: isWinbackFinal(step) && c.billing === "ads" };
}

export const WINBACK_MAX_SUBJECT = 60;
export const WINBACK_COPY_SYSTEM = `You write short, plain, kind emails for Komendly to customers whose card payment failed or who cancelled. Voice: Ozzy, Komendly's friendly helper; human, low-key, no guilt, no fake urgency.
Rules: give something useful first. Use only the facts given. Never invent prices, discounts, numbers, results or features. No links or URLs (buttons are added for you). Plain text, 2-4 short paragraphs, under 120 words. Return JSON {subject, preheader, paragraphs, ctaLabel}.`;

export function buildWinbackPrompt(c: WinbackCopyContext): string {
  const angle: Record<WinbackStep, string> = {
    f1_1h: "Their card payment just failed (often an expired card). Calm heads-up; updating the card takes a minute via the button; nothing is lost yet.",
    f2_d3: "Payment still failing. Remind what they keep by fixing it (their account, saved work, monthly credits/videos).",
    f3_d7: "Last reminder before the subscription may end. Simple, helpful, no pressure.",
    c1_d3: "They cancelled a few days ago. Thank them, ask in one line what didn't work (one-click reason buttons are below the text), mention their work stays saved.",
    c2_d14: "Fresh value: remind them their past ads/brand are saved and they can make a fresh ad from their website anytime; one practical ad tip.",
    c3_d30: "Last note. If they want to come back, one-time 20% off their first payment back, for 72 hours, applied automatically by the button.",
  };
  return [
    `Step: ${c.step}. ${angle[c.step]}`,
    `First name: ${c.firstName ?? "(unknown: use 'Hi there')"}`,
    `Product: ${c.billing === "ads" ? "Ozzy (Website2ads): turns their website into ready-to-post ads; Ozzy Studio makes promo videos" : "Komendly testimonials: AI-avatar video testimonials from real customer reviews"}`,
    c.planName ? `Their plan: ${c.planName}` : "",
    c.discount ? "Discount: 20% off once, 72 hours, single use." : "No discount exists in this email: do not mention any discount, percentage, coupon or deal.",
    c.billing === "ads" ? `Guarantee (may mention): ${ADS_GUARANTEE}` : "",
    c.brandName ? `Their brand: ${c.brandName}` : "",
    c.readyAdCount ? `They have ${c.readyAdCount} ads saved. Headlines: ${c.headlines.join(" | ")}` : "",
    `Subject max ${WINBACK_MAX_SUBJECT} chars; ctaLabel max 28 chars.`,
  ].filter(Boolean).join("\n");
}

export function checkWinbackCopy(x: EmailCopy, c: WinbackCopyContext): string | null {
  if (!x.subject.trim() || x.subject.length > WINBACK_MAX_SUBJECT) return "subject length";
  if (!x.paragraphs.length || x.paragraphs.length > 5) return "paragraph count";
  if (x.paragraphs.join(" ").split(/\s+/).filter(Boolean).length > 130) return "too long";
  if (!x.ctaLabel.trim() || x.ctaLabel.length > 28) return "cta label";
  const all = [x.subject, x.preheader, x.ctaLabel, ...x.paragraphs].join("\n");
  if (/https?:\/\/|www\./i.test(all)) return "contains a link";
  const pct = c.discount ? all.replace(/\b20%/g, "") : all;
  if (/%/.test(pct) || (!c.discount && /\b(discount|coupon|promo|deal)\b/i.test(all))) return "invented discount";
  if (/\$\d/.test(all)) return "price";
  if (c.billing !== "ads" && /guarantee|refund/i.test(all)) return "guarantee claim";
  if (/\b\d{2,}\s*(\+\s*)?(businesses|customers|brands|users|companies)\b/i.test(all)) return "invented social proof";
  return null;
}

export function fallbackWinbackCopy(c: WinbackCopyContext): EmailCopy {
  const hi = `Hi ${c.firstName ?? "there"},`;
  const plan = c.planName ?? "your plan";
  const what = c.billing === "ads" ? "ads" : "videos";
  const saved = c.readyAdCount > 0 ? `Your ${c.readyAdCount} ${what}${c.brandName ? ` for ${c.brandName}` : ""} are still saved in your account.` : `Everything you made is still saved in your account.`;
  switch (c.step) {
    case "f1_1h":
      return { subject: "Your card payment didn't go through", preheader: "Usually an expired card. Takes a minute to fix.", paragraphs: [hi, `The latest payment for ${plan} didn't go through. It's usually an expired or replaced card, and nothing is lost yet.`, "The button below opens a secure Stripe page where you can update your card in about a minute.", "Questions? Just reply; a real person reads every reply."], ctaLabel: "Update my card" };
    case "f2_d3":
      return { subject: "Still having trouble with your payment", preheader: "Keep your account, credits and saved work.", paragraphs: [hi, `Your payment for ${plan} is still failing. Fixing it keeps your monthly ${c.billing === "ads" ? "credits" : "minutes"} and everything you've made.`, saved, "Updating your card takes about a minute."], ctaLabel: "Update my card" };
    case "f3_d7":
      return { subject: "Last reminder about your payment", preheader: "Your plan may end soon.", paragraphs: [hi, `This is my last reminder: the payment for ${plan} still hasn't gone through, and your subscription may end soon.`, "If you'd like to keep it, the button below updates your card. If not, no action is needed."], ctaLabel: "Update my card" };
    case "c1_d3":
      return { subject: "Thanks for trying Komendly", preheader: "One quick question, one click.", paragraphs: [hi, `Your ${plan} has ended. Thanks for giving it a go. ${saved}`, "Would you tell me what didn't work? One click on a reason below is enough, and it really helps us improve."], ctaLabel: "See what's new" };
    case "c2_d14":
      return { subject: c.brandName ? `Fresh ideas for ${c.brandName}`.slice(0, WINBACK_MAX_SUBJECT) : "A fresh idea for your ads", preheader: "Your work is saved; here's a quick tip.", paragraphs: [hi, saved, c.billing === "ads" ? "Tip: an ad that opens with the problem your customer has (not your brand name) usually gets more clicks. You can make a fresh ad from your website anytime." : "Tip: a short testimonial video pinned to your profile keeps working for you long after you post it.", "Your account is still there whenever you want it."], ctaLabel: c.billing === "ads" ? "Make a fresh ad" : "Open my account" };
    case "c3_d30":
      return c.discount
        ? { subject: "20% off if you'd like to come back (72h)", preheader: "One time, then I'll stop emailing about this.", paragraphs: [hi, `This is my last note. If you'd like to come back to ${plan}, here's 20% off your first payment back, for the next 72 hours.`, "It's applied automatically with the button below, works once and only for you.", "Not for you? No worries, I won't follow up again."], ctaLabel: "Come back with 20% off" }
        : { subject: "Last note from Komendly", preheader: "Then I'll stop emailing about this.", paragraphs: [hi, `This is my last note. ${saved} If you ever want to come back, it's one click away.`, "Not for you? No worries, I won't follow up again."], ctaLabel: "See plans" };
  }
}

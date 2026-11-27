// Unit economics for the offer ladder (free 10 ads -> $9 unlock -> upsell -> continuity). Pure maths (computeEconomics)
// + a db loader (loadEconomicsInput) that works with the web, engine and kly Prisma clients. Imports only pure files so
// the engine image can copy it. Every metric says how sure we are: measured (observed, n >= 30), estimated (observed on a
// small sample, or it leans on a stated assumption) or insufficient (n < 5 / no data). Rates carry a Wilson 95% interval.
import { isInternalEmail } from "../internal-email";
import { systemForTouch } from "../growth/systems";

export type Confidence = "measured" | "estimated" | "insufficient";
export const MIN_N_MEASURED = 30;
export const MIN_N_ESTIMATED = 5;
export const confidenceFor = (n: number, assumption = false): Confidence => (n < MIN_N_ESTIMATED ? "insufficient" : n < MIN_N_MEASURED || assumption ? "estimated" : "measured");

/** Assumptions used ONLY when the data cannot answer (always labelled). */
export const ASSUMPTIONS = { monthlyChurn: 0.1, grossMargin: 0.7, note: "Assumed until >= 10 subscribers have 90+ days of history." } as const;

export type Touch = { utm_source?: string; utm_medium?: string; utm_campaign?: string; fbclid?: string; fbc?: string; referrer?: string; landing?: string } | null;
const META_SOURCES = new Set(["facebook", "fb", "ig", "instagram", "meta", "meta_ads", "facebook_ads"]);

/** Same mapping as src/lib/ads/funnel.ts classifyTouch (channel only), built on systemForTouch. */
export function channelOfTouch(t: Touch | undefined): string {
  const src = t?.utm_source?.toLowerCase();
  if (t?.fbclid || t?.fbc || (src && META_SOURCES.has(src))) return "meta_paid";
  const sys = systemForTouch(t ?? null);
  if (sys) return `sys_${sys}`;
  if (src === "outbound") return "kly_email";
  if (src === "blog" || t?.utm_medium === "blog" || t?.landing?.startsWith("/blog")) return "blog";
  if (src || t?.utm_campaign) return "campaign";
  if (t?.referrer) return "referral";
  return "direct";
}

/** Internal/test accounts: shared rule + our own sending domain and the known integration-test inbox. */
export function isInternalAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return isInternalEmail(e) || /@getkomendly\.com$/.test(e) || e === "integration-testing@zapier.com" || e === "sold@nolangrout.com";
}

export type Rate = { value: number | null; successes: number; n: number; lo: number | null; hi: number | null; confidence: Confidence };
export function rate(successes: number, n: number): Rate {
  if (n <= 0) return { value: null, successes, n, lo: null, hi: null, confidence: "insufficient" };
  const p = successes / n, z = 1.96, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { value: r(p), successes, n, lo: r(Math.max(0, c - h)), hi: r(Math.min(1, c + h)), confidence: confidenceFor(n) };
}
export type Money = { cents: number | null; confidence: Confidence; n: number; note?: string };
const money = (cents: number | null, n: number, note?: string, assumption = false): Money => ({ cents: cents === null ? null : Math.round(cents), n, confidence: cents === null ? "insufficient" : confidenceFor(n, assumption), ...(note ? { note } : {}) });

// ---------- input ----------
export type SignupFact = { workspaceId: string; touch: Touch; at: Date; activated: boolean; upsellShown: boolean; upsellAccepted: boolean };
export type PaymentFact = { workspaceId: string; at: Date; amountCents: number; recurring: boolean };
export type SubscriberFact = { workspaceId: string; monthlyCents: number; since: Date | null };
export type EconomicsInput = {
  now: Date;
  windowDays: number;
  visits: { touch: Touch; at: Date }[];
  signups: SignupFact[];
  /** All-time, de-duplicated, non-internal revenue payments. */
  payments: PaymentFact[];
  /** Currently active paying subscriptions (non-internal). */
  subscribers: SubscriberFact[];
  /** Subscriptions that ended (churned events) in the window / ever. */
  churned: number;
  refundCount: number;
  refundCents: number;
  /** Provider generation cost per workspace (cents) for non-internal workspaces. */
  generationCentsByWorkspace: Record<string, number>;
  klyCents: number;
  metaSpendCents: number;
  infraMonthlyCents: number;
};

export type ChannelEconomics = {
  channel: string; visitors: number; signups: number; activated: number; firstPurchases: number; upsellShown: number; upsellBought: number; subscribers: number; day30Retained: number; day30Eligible: number;
  revenueCents: number; spendCents: number; signupRate: Rate; activationRate: Rate; purchaseRate: Rate; cacCents: Money;
};
export type Economics = {
  generatedAt: string; windowDays: number;
  funnel: { visitors: number; signups: number; activated: number; firstPurchases: number; upsellShown: number; upsellBought: number; subscribers: number; day30Retained: number; day30Eligible: number; deliveryDone: number; deliveryTotal: number };
  rates: { visitToSignup: Rate; signupToActivated: Rate; activatedToPurchase: Rate; signupToPurchase: Rate; upsellShownToBought: Rate; upsellBoughtToSubscriber: Rate; day30Retention: Rate };
  byChannel: ChannelEconomics[];
  payingCustomers: number;
  revenue: { windowCents: number; allTimeCents: number; firstPurchaseCents: number; recurringCents: number };
  costs: { generationCents: number; klyCents: number; metaCents: number; infraCents: number; acquisitionCents: number; totalCents: number };
  cacCents: Money; firstPurchaseMarginCents: Money; payback30: { ratio: number | null; confidence: Confidence; n: number; note: string };
  ltvCents: Money & { basis: "empirical" | "assumption" | "none" }; ltgpToCac: { ratio: number | null; confidence: Confidence; note: string };
  mrrCents: Money; monthlyChurn: Rate; refunds: { count: number; cents: number; rate: Rate };
  cashFlow: { inCents: number; outCents: number; netCents: number; confidence: Confidence; note: string };
  assumptions: typeof ASSUMPTIONS;
};

const DAY = 86_400_000;
const sum = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0);

/** Revenue-bearing payments (same rule as funnel.ts revenuePayments): purchased + renewed; paid_converted only if no `purchased` exists. */
export function dedupeRevenueEvents<T extends { name: string }>(rows: readonly T[]): T[] {
  const p = rows.filter((x) => x.name === "purchased" || x.name === "renewed" || x.name === "paid_converted");
  return p.some((x) => x.name === "purchased") ? p.filter((x) => x.name !== "paid_converted") : p;
}

export function computeEconomics(i: EconomicsInput): Economics {
  const now = i.now.getTime();
  const from = now - i.windowDays * DAY;
  const firstPay = new Map<string, PaymentFact>();
  for (const p of [...i.payments].sort((a, b) => a.at.getTime() - b.at.getTime())) if (!firstPay.has(p.workspaceId)) firstPay.set(p.workspaceId, p);
  const subSet = new Set(i.subscribers.map((s) => s.workspaceId));
  const inWindow = (d: Date) => d.getTime() >= from && d.getTime() <= now;
  const sigs = i.signups.filter((s) => inWindow(s.at));
  const visits = i.visits.filter((v) => inWindow(v.at));
  const purchased = (s: SignupFact) => firstPay.has(s.workspaceId);

  const eligible30 = i.subscribers.filter((s) => s.since && now - s.since.getTime() >= 30 * DAY);
  const retained30 = eligible30.length; // active now AND subscribed 30+ days ago
  const everSubscribed = new Set(i.payments.filter((p) => p.recurring).map((p) => p.workspaceId));
  const churnedEligible = Math.max(0, [...everSubscribed].filter((w) => !subSet.has(w)).length);
  const day30Eligible = eligible30.length + churnedEligible;

  const funnel = {
    visitors: visits.length, signups: sigs.length, activated: sigs.filter((s) => s.activated).length, firstPurchases: sigs.filter(purchased).length,
    upsellShown: sigs.filter((s) => s.upsellShown).length, upsellBought: sigs.filter((s) => s.upsellAccepted).length,
    subscribers: sigs.filter((s) => subSet.has(s.workspaceId)).length, day30Retained: retained30, day30Eligible,
    deliveryDone: sigs.filter((s) => s.activated).length, deliveryTotal: sigs.length,
  };
  const rates = {
    visitToSignup: rate(funnel.signups, funnel.visitors),
    signupToActivated: rate(funnel.activated, funnel.signups),
    activatedToPurchase: rate(sigs.filter((s) => s.activated && purchased(s)).length, funnel.activated),
    signupToPurchase: rate(funnel.firstPurchases, funnel.signups),
    upsellShownToBought: rate(sigs.filter((s) => s.upsellShown && s.upsellAccepted).length, funnel.upsellShown),
    upsellBoughtToSubscriber: rate(sigs.filter((s) => s.upsellAccepted && subSet.has(s.workspaceId)).length, funnel.upsellBought),
    day30Retention: rate(retained30, day30Eligible),
  };

  // costs
  const gen = sum(Object.values(i.generationCentsByWorkspace));
  const infra = Math.round((i.infraMonthlyCents * i.windowDays) / 30);
  const acquisition = i.metaSpendCents + i.klyCents;
  const costs = { generationCents: Math.round(gen), klyCents: Math.round(i.klyCents), metaCents: Math.round(i.metaSpendCents), infraCents: infra, acquisitionCents: Math.round(acquisition), totalCents: Math.round(acquisition + gen + infra) };

  // channels
  const keys = new Set<string>([...visits.map((v) => channelOfTouch(v.touch)), ...sigs.map((s) => channelOfTouch(s.touch))]);
  const spendBy = (c: string) => (c === "meta_paid" ? i.metaSpendCents : c === "kly_email" ? i.klyCents : 0);
  keys.add("meta_paid");
  if (i.klyCents) keys.add("kly_email");
  const byChannel: ChannelEconomics[] = [...keys].map((channel) => {
    const v = visits.filter((x) => channelOfTouch(x.touch) === channel).length;
    const s = sigs.filter((x) => channelOfTouch(x.touch) === channel);
    const fp = s.filter(purchased);
    const spend = spendBy(channel);
    const rev = sum(fp.map((x) => sum(i.payments.filter((p) => p.workspaceId === x.workspaceId).map((p) => p.amountCents))));
    return {
      channel, visitors: v, signups: s.length, activated: s.filter((x) => x.activated).length, firstPurchases: fp.length, upsellShown: s.filter((x) => x.upsellShown).length,
      upsellBought: s.filter((x) => x.upsellAccepted).length, subscribers: s.filter((x) => subSet.has(x.workspaceId)).length,
      day30Retained: s.filter((x) => eligible30.some((e) => e.workspaceId === x.workspaceId)).length, day30Eligible: s.filter((x) => everSubscribed.has(x.workspaceId)).length,
      revenueCents: rev, spendCents: Math.round(spend), signupRate: rate(s.length, v), activationRate: rate(s.filter((x) => x.activated).length, s.length), purchaseRate: rate(fp.length, s.length),
      cacCents: fp.length ? money(spend / fp.length, fp.length, spend ? undefined : "no tracked spend for this channel (free)") : money(null, 0, "no paying customers yet"),
    };
  }).sort((a, b) => b.firstPurchases - a.firstPurchases || b.signups - a.signups || a.channel.localeCompare(b.channel));

  // revenue
  const winPays = i.payments.filter((p) => inWindow(p.at));
  const revenue = { windowCents: sum(winPays.map((p) => p.amountCents)), allTimeCents: sum(i.payments.map((p) => p.amountCents)), firstPurchaseCents: sum([...firstPay.values()].map((p) => p.amountCents)), recurringCents: sum(i.payments.filter((p) => p.recurring).map((p) => p.amountCents)) };
  const payingCustomers = new Set([...i.payments.map((p) => p.workspaceId), ...i.subscribers.map((s) => s.workspaceId)]).size;
  const newCustomersWin = [...firstPay.values()].filter((p) => inWindow(p.at)).length;

  const cac = newCustomersWin > 0 ? money(acquisition / newCustomersWin, newCustomersWin, "tracked acquisition spend (Meta ad spend event + Kly cost) / new paying customers in window; excludes your time") : money(null, 0, "no new paying customers in window");
  const genPerCust = payingCustomers ? sum([...firstPay.keys()].map((w) => i.generationCentsByWorkspace[w] ?? 0)) / firstPay.size : 0;
  const avgFirst = firstPay.size ? sum([...firstPay.values()].map((p) => p.amountCents)) / firstPay.size : null;
  const firstPurchaseMargin = avgFirst === null ? money(null, 0, "no purchases yet") : money(avgFirst - genPerCust - (cac.cents ?? 0), firstPay.size, "avg first payment - its generation cost - CAC (negative = the first sale alone does not pay for itself)");

  // 30-day payback: gross profit inside 30 days of each customer's first payment vs CAC
  const gp30 = [...firstPay.values()].map((f) => sum(i.payments.filter((p) => p.workspaceId === f.workspaceId && p.at.getTime() - f.at.getTime() <= 30 * DAY).map((p) => p.amountCents)) - (i.generationCentsByWorkspace[f.workspaceId] ?? 0));
  const avgGp30 = gp30.length ? sum(gp30) / gp30.length : null;
  const payback30 = {
    ratio: avgGp30 !== null && cac.cents ? Math.round((avgGp30 / cac.cents) * 100) / 100 : null,
    confidence: avgGp30 !== null && cac.cents ? confidenceFor(gp30.length) : ("insufficient" as Confidence), n: gp30.length,
    note: avgGp30 === null ? "no customers yet" : !cac.cents ? "CAC unknown or zero (free channels only): payback not meaningful" : `ratio >= 1 means 30-day gross profit repays CAC (Hormozi: one customer funds the next two = ratio >= 2)`,
  };

  // MRR + churn + LTV
  const mrr = money(sum(i.subscribers.map((s) => s.monthlyCents)), i.subscribers.length, i.subscribers.length ? undefined : "no active subscribers");
  const churnBase = i.subscribers.length + i.churned;
  const monthlyChurn = rate(i.churned, churnBase);
  const arpa = i.subscribers.length ? sum(i.subscribers.map((s) => s.monthlyCents)) / i.subscribers.length : null;
  const mature = eligible30.filter((s) => s.since && now - s.since.getTime() >= 90 * DAY).length;
  let ltv: Economics["ltvCents"];
  if (arpa === null) ltv = { ...money(null, 0, "no subscribers: LTV unknowable yet"), basis: "none" };
  else if (mature >= 10 && monthlyChurn.value) ltv = { ...money((arpa * ASSUMPTIONS.grossMargin) / monthlyChurn.value, mature, "empirical churn, assumed margin"), basis: "empirical" };
  else ltv = { ...money((arpa * ASSUMPTIONS.grossMargin) / ASSUMPTIONS.monthlyChurn, i.subscribers.length, `ASSUMPTION: ${ASSUMPTIONS.monthlyChurn * 100}% monthly churn, ${ASSUMPTIONS.grossMargin * 100}% margin; not measured`, true), basis: "assumption" };
  const ltgpRatio = ltv.cents && cac.cents ? Math.round((ltv.cents / cac.cents) * 100) / 100 : null;
  const ltgpToCac = { ratio: ltgpRatio, confidence: ltgpRatio === null ? ("insufficient" as Confidence) : ltv.basis === "empirical" ? confidenceFor(mature) : ("estimated" as Confidence), note: ltgpRatio === null ? "needs a subscriber and a non-zero CAC" : "target >= 3 (Hormozi LTGP:CAC)" };

  const cashIn = revenue.windowCents - i.refundCents;
  const cashFlow = { inCents: cashIn, outCents: costs.totalCents, netCents: cashIn - costs.totalCents, confidence: confidenceFor(winPays.length), note: "window cash: payments - refunds - tracked costs (generation, Kly, Meta spend event, infrastructure constant); Meta spend only appears once an ad_spend event is written" };

  return {
    generatedAt: i.now.toISOString(), windowDays: i.windowDays, funnel, rates, byChannel, payingCustomers, revenue, costs, cacCents: cac, firstPurchaseMarginCents: firstPurchaseMargin, payback30, ltvCents: ltv, ltgpToCac, mrrCents: mrr, monthlyChurn,
    refunds: { count: i.refundCount, cents: i.refundCents, rate: rate(i.refundCount, i.payments.length) }, cashFlow, assumptions: ASSUMPTIONS,
  };
}

// ---------- loader ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
export type EconomicsDb = { [k: string]: any };
const ACTIVE = ["active", "past_due", "trialing"];
const touchOf = (p: any): Touch => { const t = p?.firstTouch ?? p?.meta?.firstTouch; return t && typeof t === "object" ? (t as Touch) : null; };
const amount = (p: any) => (typeof p?.amountCents === "number" ? p.amountCents : 0);
const PLAN_CENTS: Record<string, number> = { starter: 4900, ad_department: 19700, autopilot: 29700, growth: 29700 };

/** Reads everything computeEconomics needs. Internal/test accounts are dropped. Read-only. */
export async function loadEconomicsInput(db: EconomicsDb, now: Date = new Date(), windowDays = 90, env: Record<string, string | undefined> = process.env): Promise<EconomicsInput> {
  const from = new Date(now.getTime() - windowDays * DAY);
  const [signupRows, payRows, landed, upsellRows, spendRows, churnRows, refundRows, subs, trials] = await Promise.all([
    db.adsEvent.findMany({ where: { name: "signed_up" }, select: { workspaceId: true, userId: true, props: true, createdAt: true } }),
    db.adsEvent.findMany({ where: { name: { in: ["purchased", "renewed", "paid_converted"] }, workspaceId: { not: null } }, orderBy: { createdAt: "asc" }, select: { workspaceId: true, name: true, props: true, createdAt: true } }),
    db.adsEvent.findMany({ where: { name: "visit_landed", createdAt: { gte: from } }, select: { props: true, createdAt: true } }),
    db.adsEvent.findMany({ where: { name: { in: ["upsell_shown", "upsell_accepted"] }, workspaceId: { not: null } }, select: { name: true, workspaceId: true } }),
    db.adsEvent.findMany({ where: { name: "ad_spend", createdAt: { gte: from } }, select: { props: true } }),
    db.adsEvent.findMany({ where: { name: "churned", createdAt: { gte: from }, workspaceId: { not: null } }, select: { workspaceId: true } }),
    db.adsEvent.findMany({ where: { name: { in: ["refunded", "refund", "charge_refunded"] } }, select: { workspaceId: true, props: true } }),
    db.adsWorkspace.findMany({ where: { stripeSubscriptionId: { not: null }, subscriptionStatus: { in: ACTIVE } }, select: { id: true, adsPlan: true, ownerId: true, updatedAt: true } }),
    db.adRun.findMany({ where: { isTrial: true, status: { in: ["completed", "partial"] } }, select: { workspaceId: true } }),
  ]);
  const wsIds = [...new Set<string>([...signupRows, ...payRows, ...subs.map((s: any) => ({ workspaceId: s.id }))].map((r: any) => r.workspaceId).filter(Boolean))];
  const owners = await db.adsWorkspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, ownerId: true } });
  const users = await db.user.findMany({ where: { id: { in: [...new Set<string>(owners.map((o: any) => o.ownerId))] } }, select: { id: true, email: true } });
  const emailOf = new Map<string, string>(users.map((u: any) => [u.id, u.email]));
  const internalWs = new Set<string>(owners.filter((o: any) => isInternalAccount(emailOf.get(o.ownerId))).map((o: any) => o.id));
  const real = (w: string | null | undefined): w is string => !!w && !internalWs.has(w);

  const seen = new Set<string>();
  const signups: SignupFact[] = [];
  const realIds = new Set<string>();
  const upsell = (name: string) => new Set<string>(upsellRows.filter((u: any) => u.name === name).map((u: any) => u.workspaceId));
  const shown = upsell("upsell_shown"), accepted = upsell("upsell_accepted");
  const trialSet = new Set<string>(trials.map((t: any) => t.workspaceId));
  for (const s of signupRows) {
    if (!real(s.workspaceId) || seen.has(s.workspaceId)) continue;
    seen.add(s.workspaceId); realIds.add(s.workspaceId);
    signups.push({ workspaceId: s.workspaceId, touch: touchOf(s.props), at: s.createdAt, activated: trialSet.has(s.workspaceId), upsellShown: shown.has(s.workspaceId), upsellAccepted: accepted.has(s.workspaceId) });
  }
  const payEv = dedupeRevenueEvents(payRows.filter((p: any) => real(p.workspaceId)));
  const payments: PaymentFact[] = payEv.map((p: any) => ({ workspaceId: p.workspaceId, at: p.createdAt, amountCents: amount(p.props), recurring: p.name === "renewed" || p.props?.kind === "plan" }));
  const subscribers: SubscriberFact[] = subs.filter((s: any) => real(s.id)).map((s: any) => {
    const firstSub = payments.filter((p) => p.workspaceId === s.id && p.recurring).sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    return { workspaceId: s.id, monthlyCents: PLAN_CENTS[s.adsPlan] ?? 0, since: firstSub?.at ?? s.updatedAt };
  });
  const runs = await db.adRun.findMany({ where: { workspaceId: { in: [...realIds, ...payments.map((p) => p.workspaceId)] } }, select: { workspaceId: true, costMicros: true } });
  const generationCentsByWorkspace: Record<string, number> = {};
  for (const r of runs) generationCentsByWorkspace[r.workspaceId] = (generationCentsByWorkspace[r.workspaceId] ?? 0) + Number(r.costMicros ?? 0) / 10_000;
  const kly = await db.outboundLead?.aggregate?.({ where: { createdAt: { gte: from } }, _sum: { costMicros: true } }).catch(() => null);
  const refunds = refundRows.filter((r: any) => real(r.workspaceId));
  return {
    now, windowDays,
    visits: landed.filter((l: any) => !(typeof l.props?.bot === "string" && l.props.bot)).map((l: any) => ({ touch: touchOf(l.props), at: l.createdAt })),
    signups, payments, subscribers,
    churned: churnRows.filter((c: any) => real(c.workspaceId)).length,
    refundCount: refunds.length, refundCents: refunds.reduce((t: number, r: any) => t + Math.abs(amount(r.props)), 0),
    generationCentsByWorkspace, klyCents: Number(kly?._sum?.costMicros ?? 0) / 10_000,
    metaSpendCents: spendRows.reduce((t: number, r: any) => t + amount(r.props), 0),
    infraMonthlyCents: Number(env.INFRA_MONTHLY_CENTS ?? 0) || 0,
  };
}

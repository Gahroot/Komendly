// P&L builder (weekly / monthly). Pure maths over already-loaded facts; the db loader is load.ts.
// Honest by construction: any cost we can't measure is `null` + listed in needsInput, totals are then a LOWER BOUND
// on cost (confidence "estimated"). Revenue is net of refunds/chargebacks. Hormozi lens: gross margin, 30-day payback, LTGP:CAC.
import type { Confidence } from "../../revenue/economics";
import { detectSpike, type Spike } from "./stats";
import type { FixedCosts, FixedItem } from "./fixed-costs";

export type ChannelFact = { channel: string; revenueCents: number; acquisitionCents: number | null; signups: number; payments: number };
export type PnlInput = {
  label: string;
  from: Date; to: Date; // [from, to)
  grossRevenueCents: number; paymentCount: number;
  refundCents: number; refundCount: number;
  chargebackCents: number | null; chargebackCount: number | null; // null = not tracked (no dispute events)
  aiCents: number | null; mediaCents: number | null; emailCents: number | null;
  klyCents: number; metaSpendCents: number | null;
  fixed: FixedCosts; cashCents: number | null;
  channels: ChannelFact[];
  newCustomers: number;
  /** daily cost series (oldest..latest, cents) for the anomaly check */
  dailyCostCents?: number[];
};

export type Pnl = {
  label: string; from: string; to: string; days: number;
  revenue: { grossCents: number; refundsCents: number; chargebacksCents: number | null; netCents: number };
  costOfRevenue: { aiCents: number | null; mediaCents: number | null; emailCents: number | null; totalCents: number };
  grossProfitCents: number; grossMarginPct: number | null;
  acquisition: { metaCents: number | null; klyCents: number; totalCents: number };
  fixedCents: number;
  operatingProfitCents: number;
  burnCents: number; runwayMonths: number | null;
  cacCents: number | null; paybackRatio30: number | null;
  refundRatePct: number | null; chargebackRatePct: number | null;
  channels: (ChannelFact & { allocatedCogsCents: number; contributionCents: number })[];
  anomaly: Spike | null;
  confidence: Confidence;
  needsInput: string[];
};

const DAY = 86_400_000;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildPnl(i: PnlInput): Pnl {
  const days = Math.max(1, Math.round((i.to.getTime() - i.from.getTime()) / DAY));
  const needs: string[] = [];
  const note = (v: number | null, msg: string) => { if (v === null) needs.push(msg); return v ?? 0; };
  const refunds = Math.max(0, i.refundCents);
  const cb = i.chargebackCents ?? 0;
  if (i.chargebackCents === null) needs.push("Chargebacks are not tracked (no Stripe dispute handler): check the Stripe dashboard.");
  const net = i.grossRevenueCents - refunds - cb;
  const ai = note(i.aiCents, "AI inference cost not measured"), media = note(i.mediaCents, "FAL/media cost not measured (testimonial videos have no cost ledger)"), email = note(i.emailCents, "Email sending cost unknown: set FIN_EMAIL_CENTS_PER_SEND");
  const cogs = ai + media + email;
  const gp = net - cogs;
  const meta = note(i.metaSpendCents, "Meta ad spend unknown: set META_ADS_TOKEN so the engine job records ad_spend");
  const acq = meta + i.klyCents;
  for (const u of i.fixed.unknown) needs.push(`Fixed cost unknown: ${u.name}`);
  const fixed = Math.round((i.fixed.monthlyCents * days) / 30);
  const op = gp - acq - fixed;
  const burn = Math.max(0, -op);
  const monthlyBurn = (burn * 30) / days;
  const runway = i.cashCents !== null && monthlyBurn > 0 ? r1(i.cashCents / monthlyBurn) : null;
  if (i.cashCents === null) needs.push("Cash balance unknown: set FIN_CASH_CENTS for runway");
  const channelRevenue = i.channels.reduce((t, c) => t + c.revenueCents, 0);
  const channels = i.channels.map((c) => {
    const cogsShare = channelRevenue > 0 ? Math.round((cogs * c.revenueCents) / channelRevenue) : 0;
    return { ...c, allocatedCogsCents: cogsShare, contributionCents: c.revenueCents - cogsShare - (c.acquisitionCents ?? 0) };
  });
  const cac = i.newCustomers > 0 && acq > 0 ? Math.round(acq / i.newCustomers) : null;
  const gpPerCustomer = i.newCustomers > 0 ? gp / i.newCustomers : null;
  const payback = cac && gpPerCustomer !== null ? r1(gpPerCustomer / cac) : null; // >= 1 means first 30 days pay back CAC
  const anomaly = i.dailyCostCents && i.dailyCostCents.length > 1 ? detectSpike(i.dailyCostCents.slice(0, -1), i.dailyCostCents[i.dailyCostCents.length - 1] ?? 0) : null;
  const confidence: Confidence = i.paymentCount < 5 ? "insufficient" : needs.length || i.paymentCount < 30 ? "estimated" : "measured";
  return {
    label: i.label, from: i.from.toISOString().slice(0, 10), to: i.to.toISOString().slice(0, 10), days,
    revenue: { grossCents: i.grossRevenueCents, refundsCents: refunds, chargebacksCents: i.chargebackCents, netCents: net },
    costOfRevenue: { aiCents: i.aiCents, mediaCents: i.mediaCents, emailCents: i.emailCents, totalCents: cogs },
    grossProfitCents: gp, grossMarginPct: net > 0 ? r1((gp / net) * 100) : null,
    acquisition: { metaCents: i.metaSpendCents, klyCents: i.klyCents, totalCents: acq },
    fixedCents: fixed, operatingProfitCents: op, burnCents: burn, runwayMonths: runway,
    cacCents: cac, paybackRatio30: payback,
    refundRatePct: i.grossRevenueCents > 0 ? r1((refunds / i.grossRevenueCents) * 100) : null,
    chargebackRatePct: i.chargebackCount !== null && i.paymentCount > 0 ? r1((i.chargebackCount / i.paymentCount) * 100) : null,
    channels, anomaly, confidence, needsInput: needs,
  };
}

export type ExpenseLine = { item: FixedItem; outcomes: number | null };
/** Fixed items that cost money (or an unknown amount) with zero measured output, or flagged cancelIfUnused. */
export function unnecessaryCandidates(lines: readonly ExpenseLine[]): { id: string; name: string; monthlyCents: number | null; why: string }[] {
  return lines.flatMap(({ item, outcomes }) => {
    const flagged = (item as FixedItem & { cancelIfUnused?: boolean }).cancelIfUnused === true;
    if (item.monthlyCents === 0) return [];
    if (outcomes === 0) return [{ id: item.id, name: item.name, monthlyCents: item.monthlyCents, why: "no measured output in the last 30 days" }];
    if (flagged) return [{ id: item.id, name: item.name, monthlyCents: item.monthlyCents, why: "flagged cancel-if-unused: confirm it is in use" }];
    return [];
  });
}

export function periodBounds(kind: "week" | "month", now: Date): { from: Date; to: Date; label: string } {
  if (kind === "month") {
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 1, 1));
    return { from, to, label: from.toISOString().slice(0, 7) };
  }
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY); // this Monday = end of last full week
  const from = new Date(mon.getTime() - 7 * DAY);
  return { from, to: mon, label: `week of ${from.toISOString().slice(0, 10)}` };
}

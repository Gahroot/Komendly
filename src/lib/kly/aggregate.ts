// Pure aggregation for the Kly control centre (no DB): money, funnel, arms, health, Ozzy's lines.

export const FUNNEL_STEPS = [
  { key: "found", label: "Found" },
  { key: "qualified", label: "Qualified" },
  { key: "giftMade", label: "Gift made" },
  { key: "sent", label: "Sent" },
  { key: "clicked", label: "Clicked" },
  { key: "replied", label: "Replied" },
  { key: "signedUp", label: "Signed up" },
  { key: "paid", label: "Paid" },
] as const;
export type FunnelKey = (typeof FUNNEL_STEPS)[number]["key"];
export type FunnelCounts = Record<FunnelKey, number>;
export interface FunnelStep { key: FunnelKey; label: string; count: number; fromPrev: number | null; fromTop: number | null }

/** Rates are null when the denominator is 0 (shown as "—", never as a fake 0%). */
export function funnelSteps(c: FunnelCounts): FunnelStep[] {
  const top = c.found;
  return FUNNEL_STEPS.map((s, i) => {
    const prevStep = FUNNEL_STEPS[i - 1];
    const prev = prevStep ? c[prevStep.key] : null;
    return { key: s.key, label: s.label, count: c[s.key], fromPrev: prev === null ? null : ratio(c[s.key], prev), fromTop: i === 0 ? null : ratio(c[s.key], top) };
  });
}

export function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

export interface MoneyInput { revenueMonthCents: number; revenueAllCents: number; payingCustomers: number; signups: number; costAllMicros: bigint; costMonthMicros: bigint }
export interface Money extends MoneyInput { costAllCents: number; costMonthCents: number; costPerPayingCents: number | null; roi: number | null }

export function microsToCents(m: bigint): number {
  return Number(m / BigInt(10_000));
}

/** ROI = (revenue - cost) / cost over all time; null without spend. */
export function money(i: MoneyInput): Money {
  const costAllCents = microsToCents(i.costAllMicros);
  return {
    ...i,
    costAllCents,
    costMonthCents: microsToCents(i.costMonthMicros),
    costPerPayingCents: i.payingCustomers > 0 ? Math.round(costAllCents / i.payingCustomers) : null,
    roi: costAllCents > 0 ? (i.revenueAllCents - costAllCents) / costAllCents : null,
  };
}

export interface ArmRow { id: string; dimension: string; key: string; status: string; origin: string; rationale: string | null; assigned: number; sends: number; clicks: number; replies: number; positiveReplies: number; signups: number; paid: number; revenueCents: number }
export interface ArmGroup { dimension: string; live: (ArmRow & { replyRate: number | null; clickRate: number | null })[]; retired: ArmRow[] }

/** Group by dimension (sorted); champion first, then by reply rate, then sends; retired kept apart. */
export function groupArms(arms: readonly ArmRow[]): ArmGroup[] {
  const dims = [...new Set(arms.map((a) => a.dimension))].sort();
  return dims.map((dimension) => {
    const mine = arms.filter((a) => a.dimension === dimension);
    const live = mine
      .filter((a) => a.status !== "retired")
      .map((a) => ({ ...a, replyRate: ratio(a.replies, a.sends), clickRate: ratio(a.clicks, a.sends) }))
      .sort((a, b) => Number(b.status === "champion") - Number(a.status === "champion") || (b.replyRate ?? -1) - (a.replyRate ?? -1) || b.sends - a.sends || a.key.localeCompare(b.key));
    const retired = mine.filter((a) => a.status === "retired").sort((a, b) => a.key.localeCompare(b.key));
    return { dimension, live, retired };
  });
}

export type Freshness = "live" | "stale" | "down" | "never";

/** Heartbeat age: live < 3 min, stale < 15 min, else down. */
export function freshness(updatedAt: Date | null, now: Date): Freshness {
  if (!updatedAt) return "never";
  const age = now.getTime() - updatedAt.getTime();
  return age < 3 * 60_000 ? "live" : age < 15 * 60_000 ? "stale" : "down";
}

export function budgetUse(spentCents: number, budgetCents: number): { pct: number | null; over: boolean } {
  if (budgetCents <= 0) return { pct: null, over: spentCents > 0 };
  return { pct: spentCents / budgetCents, over: spentCents >= budgetCents };
}

export interface DailyRow { day: Date; sent: number; clicks: number; replies: number; signups: number; paid: number }

/** Last `days` UTC days ending today, zero-filled where Kly wrote no rollup. */
export function dailySeries(rows: readonly DailyRow[], now: Date, days = 30): { date: string; sent: number; clicks: number; replies: number; signups: number }[] {
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(date);
    return { date, sent: r?.sent ?? 0, clicks: r?.clicks ?? 0, replies: r?.replies ?? 0, signups: r?.signups ?? 0 };
  });
}

export interface OzzyFacts { weekSignups: number; weekPaid: number; weekRevenueCents: number; sentToday: number; mailboxes: number; heartbeat: Freshness; enabled: boolean }

/** One short, true line for Ozzy's speech bubble. */
export function ozzyLine(f: OzzyFacts): string {
  if (!f.enabled) return "Kly's switched off. Flip it back on when you're ready.";
  if (f.heartbeat === "never") return "G'day! Kly hasn't checked in yet. Waiting for the worker.";
  if (f.heartbeat === "down") return "Kly's gone quiet. Worth a look at the worker.";
  if (f.weekPaid > 0) return `Beauty! ${plural(f.weekPaid, "new paying customer")} this week, ${usd(f.weekRevenueCents)} in.`;
  if (f.weekSignups > 0) return `G'day! ${plural(f.weekSignups, "new signup")} from Kly this week.`;
  if (f.mailboxes === 0) return "G'day! Waiting for mailboxes before I send a thing.";
  if (f.sentToday > 0) return `${plural(f.sentToday, "gift")} sent today. Fingers crossed.`;
  return "All quiet so far. Kly's warming up.";
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function pct(r: number | null, digits = 1): string {
  return r === null ? "—" : `${(r * 100).toFixed(digits)}%`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(at: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}

// Ozzy HQ (owner admin overview) maths. Pure: no I/O. Loader: hq-queries.ts.
import { PLAN_CONFIG, type PlanKey } from "@/lib/stripe-config";

const DAY_MS = 86_400_000;
const LEGACY_ACTIVE = new Set(["active", "past_due"]);

/** Legacy testimonial MRR at current list prices (grandfathered prices may be lower; label it as list). */
export function legacyMrr(users: readonly { plan: string; subscriptionStatus: string }[]): { mrrCents: number; subscribers: number } {
  const active = users.filter((u) => u.plan in PLAN_CONFIG && LEGACY_ACTIVE.has(u.subscriptionStatus));
  const mrrCents = active.reduce((s, u) => s + PLAN_CONFIG[u.plan as PlanKey].monthlyPrice * 100, 0);
  return { mrrCents, subscribers: active.length };
}

/** Counts of dates inside today (since local-agnostic UTC midnight), last 7 and last 30 days. */
export function windowCounts(dates: readonly Date[], now: Date): { today: number; d7: number; d30: number } {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const t = now.getTime();
  let today = 0, d7 = 0, d30 = 0;
  for (const d of dates) {
    const x = d.getTime();
    if (x > t) continue;
    if (x >= midnight) today++;
    if (x >= t - 7 * DAY_MS) d7++;
    if (x >= t - 30 * DAY_MS) d30++;
  }
  return { today, d7, d30 };
}

/** Credits spent per app from ledger sums by reason (negative deltas = spend; releases give back). */
export function creditsSpentByApp(sums: readonly { reason: string; delta: number }[]): { ads: number; studio: number } {
  const get = (r: string) => sums.filter((s) => s.reason === r).reduce((t, s) => t + s.delta, 0);
  return { ads: Math.max(0, -(get("reserve") + get("release"))), studio: Math.max(0, -get("studio_charge")) };
}

export interface AttentionItem {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "bad" | "warn";
}

/** Only non-zero items, worst first (bad before warn, then count desc, key asc). */
export function attentionList(items: readonly AttentionItem[]): AttentionItem[] {
  return items
    .filter((i) => i.count > 0)
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1) || b.count - a.count || a.key.localeCompare(b.key));
}

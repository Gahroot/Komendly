// One revenue snapshot = economics + constraint ranking + business stage. Built by the engine daily (sys_revenue_intel),
// stored as AdsEvent `revenue_snapshot` (props = snapshot), and read by /admin/ads/revenue and the Monday digest. Pure TS.
import { businessStage, diagnoseConstraint, type BusinessStage, type Constraint } from "./constraints";
import { computeEconomics, loadEconomicsInput, type Economics, type EconomicsDb, type EconomicsInput } from "./economics";

export const SNAPSHOT_EVENT = "revenue_snapshot";
export type RevenueSnapshot = { day: string; economics: Economics; constraints: Constraint[]; stage: BusinessStage };

export function snapshotFromInput(input: EconomicsInput): RevenueSnapshot {
  const economics = computeEconomics(input);
  const first = new Map<string, number>();
  for (const p of [...input.payments].sort((a, b) => a.at.getTime() - b.at.getTime())) if (!first.has(p.workspaceId)) first.set(p.workspaceId, p.at.getTime());
  const now = input.now.getTime(), week = 7 * 86_400_000;
  const weeks = new Set<number>();
  for (const t of first.values()) if (now - t < 8 * week) weeks.add(Math.floor((now - t) / week));
  const stage = businessStage({
    payingCustomers: economics.payingCustomers, totalRevenueCents: economics.revenue.allTimeCents, mrrCents: economics.mrrCents.cents ?? 0,
    recurringCustomers: new Set([...input.payments.filter((p) => p.recurring).map((p) => p.workspaceId), ...input.subscribers.map((s) => s.workspaceId)]).size,
    newPayingLast30d: [...first.values()].filter((t) => now - t < 30 * 86_400_000).length, weeksWithNewCustomersLast8: weeks.size,
  });
  return { day: input.now.toISOString().slice(0, 10), economics, constraints: diagnoseConstraint(economics), stage };
}

export async function buildRevenueSnapshot(db: EconomicsDb, now = new Date(), windowDays = 90): Promise<RevenueSnapshot> {
  return snapshotFromInput(await loadEconomicsInput(db, now, windowDays));
}

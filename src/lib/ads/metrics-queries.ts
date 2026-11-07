// DB loaders for the admin overview; all maths lives in metrics.ts.
import { prisma } from "@/lib/prisma";
import { ADS_TOPUPS } from "./billing-config";
import {
  averageCostPerAdUsd, churnRate, computeMrr, failureRate, grossMargin, percentile,
  qcPassRate, runsPerDay, timeToFirstAdSeconds, trialConversionByCohort,
} from "./metrics";

const DAY_MS = 24 * 3600 * 1000;
export const TTFA_TARGET_SECONDS = 180;

// Blended list price per top-up credit (placeholder pricing) to estimate top-up revenue.
const TOPUP_CENTS_PER_CREDIT =
  ADS_TOPUPS.reduce((s, t) => s + t.priceCents, 0) / ADS_TOPUPS.reduce((s, t) => s + t.credits, 0);

export async function loadAdsOverview(now: Date = new Date()) {
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since90 = new Date(now.getTime() - 90 * DAY_MS);
  const [subs, churned30, events, runs, ads, topups] = await Promise.all([
    prisma.adsWorkspace.findMany({ select: { adsPlan: true, subscriptionStatus: true } }),
    prisma.adsEvent.count({ where: { name: "churned", createdAt: { gte: since30 } } }),
    prisma.adsEvent.findMany({
      where: { name: { in: ["trial_started", "paid_converted"] }, createdAt: { gte: since90 } },
      select: { name: true, workspaceId: true, createdAt: true },
    }),
    prisma.adRun.findMany({
      where: { createdAt: { gte: since30 } },
      select: { createdAt: true, confirmedAt: true, firstAdAt: true, status: true },
    }),
    prisma.ad.findMany({ where: { createdAt: { gte: since30 } }, select: { status: true, costMicros: true } }),
    prisma.creditLedger.aggregate({ where: { reason: "topup", createdAt: { gte: since30 } }, _sum: { delta: true } }),
  ]);

  const mrr = computeMrr(subs);
  const ttfa = timeToFirstAdSeconds(runs);
  const costs = ads.filter((a) => a.costMicros > BigInt(0)).map((a) => Number(a.costMicros));
  const totalCost = costs.reduce((s, c) => s + c, 0);
  const revenue30 = mrr.mrrCents + Math.round((topups._sum.delta ?? 0) * TOPUP_CENTS_PER_CREDIT);
  const conversion = trialConversionByCohort(events, now, 30);

  return {
    generatedAt: now.toISOString(),
    ...mrr,
    // Approximation: subscribers at period start = currently active + churned during the period.
    churnRate30d: churnRate(mrr.activeSubscribers + churned30, churned30),
    churned30d: churned30,
    conversion,
    ttfa: { p50: percentile(ttfa, 50), p90: percentile(ttfa, 90), samples: ttfa.length, targetSeconds: TTFA_TARGET_SECONDS },
    runsPerDay: runsPerDay(runs.map((r) => r.createdAt), now, 30),
    runs30d: runs.length,
    qcPassRate: qcPassRate(ads.map((a) => a.status)),
    failureRate: failureRate(runs.map((r) => r.status)),
    avgCostPerAdUsd: averageCostPerAdUsd(costs),
    revenue30dCents: revenue30,
    cost30dUsd: totalCost / 1e6,
    grossMargin: grossMargin(revenue30, totalCost),
  };
}

export type AdsOverview = Awaited<ReturnType<typeof loadAdsOverview>>;

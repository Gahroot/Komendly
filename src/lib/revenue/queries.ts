// Web loader for /admin/ads/revenue and the Monday digest (read-only). Maths lives in economics/constraints/experiments.
import { prisma } from "@/lib/prisma";
import { EXPERIMENT_DEFAULTS, loadExperimentResults, type ExperimentResults } from "./experiments";
import { buildRevenueSnapshot, SNAPSHOT_EVENT, type RevenueSnapshot } from "./snapshot";
import type { ExperimentLine } from "./digest";

export async function loadRevenueDashboard(now = new Date()) {
  const db = prisma as never;
  const [live, history, flags, defined] = await Promise.all([
    buildRevenueSnapshot(db, now),
    prisma.adsEvent.findMany({ where: { name: SNAPSHOT_EVENT }, orderBy: { createdAt: "desc" }, take: 8, select: { props: true, createdAt: true } }),
    prisma.adsFeatureFlag.findMany({ where: { key: { in: ["sys_revenue_intel", "sys_revenue_digest"] } } }),
    prisma.adsEvent.findMany({ where: { name: "exp_defined" }, select: { props: true } }),
  ]);
  const keys = [...new Set([...EXPERIMENT_DEFAULTS.map((d) => d.key), ...defined.map((d) => (d.props as { def?: { key?: string } })?.def?.key).filter((k): k is string => !!k)])];
  const experiments: ExperimentResults[] = await Promise.all(keys.map((k) => loadExperimentResults(db, k)));
  const on = (k: string) => flags.find((f) => f.key === k)?.enabled ?? false;
  return { live, history: history.map((h) => ({ at: h.createdAt, snapshot: h.props as unknown as RevenueSnapshot })), experiments, flags: { intel: on("sys_revenue_intel"), digest: on("sys_revenue_digest") } };
}

export const experimentLine = (r: ExperimentResults): ExperimentLine => {
  const lead = Object.entries(r.evaluation.probBest).sort((a, b) => b[1] - a[1])[0];
  return { key: r.key, status: r.concluded ? "concluded" : "running", verdict: r.evaluation.verdict, leader: lead && r.counts.some((c) => c.exposures) ? `${lead[0]} (${(lead[1] * 100).toFixed(0)}% prob. best)` : undefined, exposures: r.counts.reduce((t, c) => t + c.exposures, 0) };
};

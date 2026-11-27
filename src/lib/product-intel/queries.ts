// Web loader for /admin/ads/outcomes (read-only).
import { prisma } from "@/lib/prisma";
import { CREATIVE_FINDING_EVENT } from "./creative";
import { EFFECTIVENESS_EVENT, buildLedger, hookLibrary, type Ledger } from "./effectiveness";
import type { Finding, Proposal } from "./findings";
import { loadOutcomes, loadPerfRows, type CustomerOutcome } from "./load";
import { OUTCOME_FAILURE_EVENT } from "./outcomes";

export type StoredFinding = Finding & { batch: string; packsScored: number; proposal: Proposal | null };
export async function loadOutcomesDashboard(now = new Date()) {
  const db = prisma as never;
  const [customers, findingEvents, failures, flags, perf, scored] = await Promise.all([
    loadOutcomes(db, now) as Promise<CustomerOutcome[]>,
    prisma.adsEvent.findMany({ where: { name: CREATIVE_FINDING_EVENT }, orderBy: { createdAt: "desc" }, take: 60, select: { props: true, createdAt: true } }),
    prisma.adsEvent.findMany({ where: { name: OUTCOME_FAILURE_EVENT }, orderBy: { createdAt: "desc" }, take: 40, select: { props: true, createdAt: true, workspaceId: true } }),
    prisma.adsFeatureFlag.findMany({ where: { key: { in: ["sys_creative_qa", "sys_outcome_verify"] } } }),
    loadPerfRows(db, now),
    prisma.adsEvent.count({ where: { name: "creative_score", createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } } }),
  ]);
  const latest = findingEvents[0] ? (findingEvents[0].props as { batch?: string }).batch : undefined;
  const findings = findingEvents.map((e) => e.props as unknown as StoredFinding).filter((f) => f.batch === latest);
  const ledger: Ledger = buildLedger(perf); // computed live from the measured rows; the weekly row is the history
  return { customers, findings, failures, perfAds: perf.length, ledger, hooks: hookLibrary(ledger), scored, flags, ledgerHistory: EFFECTIVENESS_EVENT };
}

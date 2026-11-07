// Credit release for ads that failed QC/generation. Same semantics as the web app's
// credits.ts: ledger row + AdsWorkspace.creditBalance in one transaction, idempotent on
// note `release:<runId>:<adId>`, never releasing more than the run reserved.
import { CREDIT_COST } from "../../../src/lib/ads/contracts";
import type { Db } from "../db";

export function adCreditCost(kind: "static" | "motion", ratios: number): number {
  return kind === "motion" ? CREDIT_COST.motion : CREDIT_COST.staticPerRatio * Math.max(1, ratios);
}

export function releaseNote(runId: string, adId: string): string {
  return `release:${runId}:${adId}`;
}

/** Returns credits released (0 when already released or nothing reserved). */
export async function releaseAdCredits(db: Db, runId: string, adId: string, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const note = releaseNote(runId, adId);
  return db.$transaction(async (tx) => {
    const run = await tx.adRun.findUnique({ where: { id: runId }, select: { workspaceId: true, creditsReserved: true } });
    if (!run) return 0;
    // Serialise releases per workspace.
    const ws = await tx.$queryRaw<Array<{ creditBalance: number }>>`
      SELECT "creditBalance" FROM "AdsWorkspace" WHERE id = ${run.workspaceId} FOR UPDATE`;
    const balance = ws[0]?.creditBalance;
    if (balance === undefined) return 0;
    if (await tx.creditLedger.findFirst({ where: { workspaceId: run.workspaceId, note }, select: { id: true } })) return 0;
    const already = await tx.creditLedger.aggregate({
      where: { workspaceId: run.workspaceId, runId, reason: "release" },
      _sum: { delta: true },
    });
    const room = run.creditsReserved - (already._sum.delta ?? 0);
    const delta = Math.min(amount, room);
    if (delta <= 0) return 0;
    await tx.creditLedger.create({
      data: { workspaceId: run.workspaceId, delta, balanceAfter: balance + delta, reason: "release", runId, note },
    });
    await tx.adsWorkspace.update({ where: { id: run.workspaceId }, data: { creditBalance: balance + delta } });
    return delta;
  });
}

export async function releaseForAd(db: Db, adId: string): Promise<number> {
  const ad = await db.ad.findUnique({ where: { id: adId }, select: { runId: true, kind: true, run: { select: { ratios: true } } } });
  if (!ad) return 0;
  return releaseAdCredits(db, ad.runId, adId, adCreditCost(ad.kind, ad.run.ratios.length));
}

// Shared by the web confirm route (confirmRun) and the engine's auto-confirm sweeper:
// once a trial run is confirmed, record the trial claim, mark the trial used and log run_confirmed.
// The DB client is injected (web and engine have separate Prisma clients), so no @/ imports here.

export type TrialClaimHashes = { domainHash: string; emailHash: string; ipHash: string | null; deviceHash: string | null };


/** Minimal structural view of the Prisma client used here, satisfied by both web and engine clients. */
export type TrialConfirmDb = {
  adsTrialClaim: {
    findFirst(args: { where: { workspaceId: string }; select: { id: true } }): Promise<{ id: string } | null>;
    create(args: { data: TrialClaimHashes & { workspaceId: string } }): Promise<unknown>;
  };
  adsWorkspace: { updateMany(args: { where: { id: string; trialUsedAt: null }; data: { trialUsedAt: Date } }): Promise<{ count: number }> };
  adsEvent: { create(args: { data: { name: string; workspaceId: string; userId: string; runId: string; props: { auto: boolean; edited: string[] } } }): Promise<unknown> };
};

export function parseTrialClaim(value: unknown): TrialClaimHashes | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.domainHash !== "string" || typeof v.emailHash !== "string") return null;
  const opt = (x: unknown) => (typeof x === "string" ? x : null);
  return { domainHash: v.domainHash, emailHash: v.emailHash, ipHash: opt(v.ipHash), deviceHash: opt(v.deviceHash) };
}

/** Record the trial claim (once per workspace) and set trialUsedAt. Idempotent. */
export async function claimTrial(db: TrialConfirmDb, workspaceId: string, claim: TrialClaimHashes | null, now: Date): Promise<void> {
  if (claim && !(await db.adsTrialClaim.findFirst({ where: { workspaceId }, select: { id: true } }))) {
    await db.adsTrialClaim.create({ data: { workspaceId, ...claim } });
  }
  await db.adsWorkspace.updateMany({ where: { id: workspaceId, trialUsedAt: null }, data: { trialUsedAt: now } });
}

export async function finalizeConfirm(
  db: TrialConfirmDb,
  run: { id: string; workspaceId: string; userId: string; isTrial: boolean; trialClaim: unknown },
  opts: { auto: boolean; edited: string[]; claim?: TrialClaimHashes | null; now: Date },
): Promise<void> {
  if (run.isTrial) await claimTrial(db, run.workspaceId, opts.claim ?? parseTrialClaim(run.trialClaim), opts.now);
  await db.adsEvent
    .create({ data: { name: "run_confirmed", workspaceId: run.workspaceId, userId: run.userId, runId: run.id, props: { auto: opts.auto, edited: opts.edited } } })
    .catch(() => undefined);
}

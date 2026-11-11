// OWNER: billing worker. Signatures are a contract used by the /ads flow — keep them.
//
// Credit model
// - Every mutation = one CreditLedger row + AdsWorkspace.creditBalance update in ONE transaction,
//   with the workspace row locked (SELECT ... FOR UPDATE). Balance never goes negative.
// - Idempotency: each mutation has a key. Stripe-driven and internal keys live in the unique
//   CreditLedger.stripeRef column (e.g. "in_123", "reserve:<runId>"). Releases use the engine's
//   format `release:<runId>:<key>` stored in `note` (the engine writes the same note), checked
//   under the row lock, so app and engine releases never double-count.
// - Free trial: NOT spendable credits. The trial (TRIAL_GRANT = 10 static + 1 motion, 1:1 only)
//   is tracked by AdsWorkspace.trialUsedAt (markTrialUsed). Trial runs must not call
//   reserveCredits; an audit-only zero-delta 'trial_grant' ledger row is written instead.
// - Expiry policy: plan (included) credits reset each billing period — unused included credits
//   expire at renewal. Top-ups never expire. Included credits are consumed first, so the amount
//   expiring is min(balance, lastGrant + usageSinceGrant) (see computeExpiringIncluded).
import { Prisma, type CreditReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TRIAL_GRANT } from "./contracts";

export class InsufficientCreditsError extends Error {
  constructor(public needed: number, public available: number) {
    super(`Need ${needed} credits, have ${available}`);
  }
}

type Tx = Prisma.TransactionClient;

export function releaseKey(runId: string, key: string): string {
  return `release:${runId}:${key}`;
}

/** Pure: unused included credits that expire at renewal (included are consumed first). */
export function computeExpiringIncluded(lastGrant: number, usageDeltaSinceGrant: number, balance: number): number {
  return Math.max(0, Math.min(balance, lastGrant + usageDeltaSinceGrant));
}

async function lockBalance(tx: Tx, workspaceId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ creditBalance: number }[]>`
    SELECT "creditBalance" FROM "AdsWorkspace" WHERE id = ${workspaceId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error(`AdsWorkspace ${workspaceId} not found`);
  return row.creditBalance;
}

async function writeEntry(
  tx: Tx,
  e: { workspaceId: string; delta: number; balanceAfter: number; reason: CreditReason; runId?: string; stripeRef?: string; note?: string; actorId?: string },
) {
  await tx.creditLedger.create({ data: e });
  await tx.adsWorkspace.update({ where: { id: e.workspaceId }, data: { creditBalance: e.balanceAfter } });
}

export interface MutationResult {
  applied: boolean; // false = idempotent replay
  delta: number;
  balance: number;
}

interface MutationInput {
  workspaceId: string;
  reason: CreditReason;
  /** Desired delta. Negative deltas fail if they would overdraw unless clampToBalance. */
  delta: number | ((balance: number, tx: Tx) => Promise<number> | number);
  stripeRef: string;
  runId?: string;
  note?: string;
  actorId?: string;
  clampToBalance?: boolean;
}

/** Core: lock, check idempotency key, apply. */
export async function applyCreditMutation(input: MutationInput): Promise<MutationResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const balance = await lockBalance(tx, input.workspaceId);
      const dup = await tx.creditLedger.findUnique({ where: { stripeRef: input.stripeRef } });
      if (dup) return { applied: false, delta: dup.delta, balance };
      let delta = typeof input.delta === "function" ? await input.delta(balance, tx) : input.delta;
      if (!Number.isInteger(delta)) throw new Error("Credit delta must be an integer");
      if (balance + delta < 0) {
        if (!input.clampToBalance) throw new InsufficientCreditsError(-delta, balance);
        delta = -balance;
      }
      const balanceAfter = balance + delta;
      await writeEntry(tx, {
        workspaceId: input.workspaceId,
        reason: input.reason,
        stripeRef: input.stripeRef,
        runId: input.runId,
        note: input.note,
        actorId: input.actorId,
        delta,
        balanceAfter,
      });
      return { applied: true, delta, balance: balanceAfter };
    });
  } catch (err) {
    // Concurrent duplicate on the unique key: treat as replay.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { applied: false, delta: 0, balance: await getBalance(input.workspaceId) };
    }
    throw err;
  }
}

/** Reserve credits for a run. Throws InsufficientCreditsError. Idempotent per runId. */
export async function reserveCredits(workspaceId: string, runId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await applyCreditMutation({ workspaceId, reason: "reserve", delta: -amount, runId, stripeRef: `reserve:${runId}` });
}

/** Release unused reserved credits (failed/QC-rejected ads). Idempotent per (runId, adId|key). */
export async function releaseCredits(workspaceId: string, runId: string, amount: number, key: string): Promise<void> {
  if (amount <= 0) return;
  const note = releaseKey(runId, key);
  await prisma.$transaction(async (tx) => {
    const balance = await lockBalance(tx, workspaceId);
    const existing = await tx.creditLedger.findFirst({ where: { workspaceId, reason: "release", note } });
    if (existing) return;
    // Never release more than was reserved for this run.
    const agg = await tx.creditLedger.groupBy({
      by: ["reason"],
      where: { workspaceId, runId, reason: { in: ["reserve", "release"] } },
      _sum: { delta: true },
    });
    const reserved = -(agg.find((a) => a.reason === "reserve")?._sum.delta ?? 0);
    const released = agg.find((a) => a.reason === "release")?._sum.delta ?? 0;
    const delta = Math.min(amount, Math.max(0, reserved - released));
    if (delta <= 0) return;
    await writeEntry(tx, { workspaceId, delta, balanceAfter: balance + delta, reason: "release", runId, note });
  });
}

export async function getBalance(workspaceId: string): Promise<number> {
  const ws = await prisma.adsWorkspace.findUnique({ where: { id: workspaceId }, select: { creditBalance: true } });
  return ws?.creditBalance ?? 0;
}

/** Mark the free trial as used (idempotent). Audit row has delta 0: trial is not spendable credit. */
export async function markTrialUsed(workspaceId: string, runId?: string): Promise<boolean> {
  const res = await applyCreditMutation({
    workspaceId,
    reason: "trial_grant",
    delta: 0,
    runId,
    stripeRef: `trial:${workspaceId}`,
    note: `trial ${TRIAL_GRANT.static} static + ${TRIAL_GRANT.motion} motion (tracked via trialUsedAt)`,
  });
  if (res.applied) await prisma.adsWorkspace.update({ where: { id: workspaceId }, data: { trialUsedAt: new Date() } });
  return res.applied;
}

/**
 * Period grant on a paid invoice: first expire unused included credits from the previous
 * grant, then grant this period's included credits. Idempotent per invoice id.
 */
export async function grantSubscriptionCredits(workspaceId: string, invoiceId: string, credits: number): Promise<MutationResult> {
  await expireIncludedCredits(workspaceId, invoiceId);
  return applyCreditMutation({ workspaceId, reason: "subscription_grant", delta: credits, stripeRef: invoiceId, note: `plan credits (${credits})` });
}

/** Expire unused included credits from the latest subscription grant. Idempotent per renewal key. */
export async function expireIncludedCredits(workspaceId: string, renewalKey: string): Promise<MutationResult> {
  return applyCreditMutation({
    workspaceId,
    reason: "expire",
    stripeRef: `expire:${renewalKey}`,
    note: "unused included credits expired at renewal",
    delta: async (balance, tx) => {
      const grant = await tx.creditLedger.findFirst({
        where: { workspaceId, reason: "subscription_grant" },
        orderBy: { createdAt: "desc" },
      });
      if (!grant) return 0;
      const usage = await tx.creditLedger.aggregate({
        where: { workspaceId, createdAt: { gt: grant.createdAt }, reason: { in: ["reserve", "release"] } },
        _sum: { delta: true },
      });
      return -computeExpiringIncluded(grant.delta, usage._sum.delta ?? 0, balance);
    },
  });
}

/** Top-up purchase. Never expires. Idempotent per payment ref. */
export async function grantTopup(workspaceId: string, stripeRef: string, credits: number, note?: string): Promise<MutationResult> {
  return applyCreditMutation({ workspaceId, reason: "topup", delta: credits, stripeRef, note: note ?? `top-up (${credits})` });
}

/** Claw back credits on refund (clamped at 0 — the user may already have spent them). */
export async function refundCredits(workspaceId: string, refundKey: string, credits: number, actorId?: string): Promise<MutationResult> {
  return applyCreditMutation({
    workspaceId,
    reason: "refund",
    delta: -Math.abs(credits),
    stripeRef: `refund:${refundKey}`,
    actorId,
    clampToBalance: true,
    note: "credits clawed back on refund",
  });
}

/** Admin manual adjustment (positive or negative; cannot overdraw). */
export async function adminAdjustCredits(workspaceId: string, delta: number, actorId: string, note: string, key: string): Promise<MutationResult> {
  return applyCreditMutation({ workspaceId, reason: "admin_adjust", delta, actorId, note, stripeRef: `admin:${key}` });
}

/** Pure: credits to add on a paid mid-period upgrade = new period's credits minus the last period grant (never negative). */
export function upgradeTopUpCredits(newPeriodCredits: number, lastGrant: number): number {
  return Math.max(0, newPeriodCredits - Math.max(0, lastGrant));
}

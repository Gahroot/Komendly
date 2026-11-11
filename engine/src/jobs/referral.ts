// "Give 10, get 10": reward the referrer when a referred workspace's trial delivers ads, and expire
// unused referral credits after 30 days. Ledger semantics mirror src/lib/ads/credits.ts
// (workspace row locked FOR UPDATE, ledger row with balanceAfter + creditBalance in one transaction).
import type { Db } from "../db";

export const REFERRAL_REWARD_CREDITS = 10;
export const REFERRAL_EXPIRY_DAYS = 30;
export const REFERRAL_MONTHLY_CAP = 5;

export function rewardRef(referralId: string): string {
  return `referral:${referralId}`;
}
export function expireRef(ledgerId: string): string {
  return `expire:${ledgerId}`;
}

/** First instant of the UTC calendar month of `now`. */
export function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type RewardOutcome = { status: "rewarded"; ledgerId: string } | { status: "capped" } | { status: "skipped"; reason: string };

/** Called when a trial run finished with >= 1 ready ad. Idempotent: only acts on a referral still in `signed_up`. */
export async function rewardReferralForRun(db: Db, run: { id: string; workspaceId: string }, now: Date = new Date()): Promise<RewardOutcome> {
  const ref = await db.adsReferral.findUnique({ where: { referredWorkspaceId: run.workspaceId }, select: { id: true, status: true } });
  if (!ref) return { status: "skipped", reason: "no referral" };
  if (ref.status !== "signed_up") return { status: "skipped", reason: `status ${ref.status}` };
  return db.$transaction(async (tx): Promise<RewardOutcome> => {
    // Lock the referral row first: a concurrent finalize sees the new status and stops.
    const locked = await tx.$queryRaw<Array<{ status: string; referrerWorkspaceId: string }>>`
      SELECT status, "referrerWorkspaceId" FROM "AdsReferral" WHERE id = ${ref.id} FOR UPDATE`;
    const row = locked[0];
    if (!row || row.status !== "signed_up") return { status: "skipped", reason: `status ${row?.status ?? "gone"}` };
    const referrer = row.referrerWorkspaceId;
    const ws = await tx.$queryRaw<Array<{ creditBalance: number }>>`
      SELECT "creditBalance" FROM "AdsWorkspace" WHERE id = ${referrer} FOR UPDATE`;
    const balance = ws[0]?.creditBalance;
    const base = { trialDoneAt: now };
    await tx.adsEvent.create({ data: { name: "referral_trial_done", workspaceId: run.workspaceId, runId: run.id, props: { referralId: ref.id, referrerWorkspaceId: referrer } } });
    if (balance === undefined) {
      await tx.adsReferral.update({ where: { id: ref.id }, data: { ...base, status: "rejected", rejectReason: "referrer_missing" } });
      return { status: "skipped", reason: "referrer workspace missing" };
    }
    const thisMonth = await tx.adsReferral.count({
      where: { referrerWorkspaceId: referrer, status: { in: ["rewarded", "paid"] }, rewardedAt: { gte: utcMonthStart(now) } },
    });
    if (thisMonth >= REFERRAL_MONTHLY_CAP) {
      await tx.adsReferral.update({ where: { id: ref.id }, data: { ...base, status: "rejected", rejectReason: "monthly_cap" } });
      await tx.adsEvent.create({ data: { name: "referral_capped", workspaceId: referrer, props: { referralId: ref.id, referredWorkspaceId: run.workspaceId, cap: REFERRAL_MONTHLY_CAP } } });
      return { status: "capped" };
    }
    const delta = REFERRAL_REWARD_CREDITS;
    const expiresAt = new Date(now.getTime() + REFERRAL_EXPIRY_DAYS * 86_400_000);
    const ledger = await tx.creditLedger.create({
      data: { workspaceId: referrer, delta, balanceAfter: balance + delta, reason: "referral_reward", stripeRef: rewardRef(ref.id), note: `referral reward (${run.workspaceId})`, expiresAt, createdAt: now },
    });
    await tx.adsWorkspace.update({ where: { id: referrer }, data: { creditBalance: balance + delta } });
    await tx.adsReferral.update({
      where: { id: ref.id },
      data: { ...base, status: "rewarded", rewardedAt: now, rewardCredits: delta, rewardLedgerId: ledger.id },
    });
    await tx.adsEvent.create({ data: { name: "referral_rewarded", workspaceId: referrer, props: { referralId: ref.id, referredWorkspaceId: run.workspaceId, credits: delta, ledgerId: ledger.id, expiresAt: expiresAt.toISOString() } } });
    return { status: "rewarded", ledgerId: ledger.id };
  });
}

// ---- Expiry ----

export interface RewardGrant {
  id: string;
  delta: number;
  createdAt: Date;
  expiresAt: Date;
}
export interface SpendMovement {
  /** reserve (< 0) or release (> 0) ledger delta. */
  delta: number;
  createdAt: Date;
}

/**
 * Unused remainder of `target` at its expiry. Rule (fair to the user, simple to explain):
 * - Spending draws from referral rewards FIRST, soonest-expiring first (ties: older grant, then id),
 *   and only from rewards that were granted and not yet expired at that moment; paid credits are used after.
 * - A release (refund of a failed ad) gives credits back to the active rewards that were drawn from,
 *   latest-expiring first (so the user keeps as much as possible).
 * - Only reserve/release movements before the target's expiresAt count.
 * Unused = max(0, reward - drawn), clamped to the current balance (never below 0).
 */
export function expiryAmount(target: RewardGrant, grants: readonly RewardGrant[], movements: readonly SpendMovement[], balance: number): number {
  const all = grants.some((g) => g.id === target.id) ? [...grants] : [...grants, target];
  const order = (a: RewardGrant, b: RewardGrant) =>
    a.expiresAt.getTime() - b.expiresAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
  all.sort(order);
  const drawn = new Map(all.map((g) => [g.id, 0]));
  const moves = movements
    .filter((m) => m.createdAt.getTime() < target.expiresAt.getTime())
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.delta - b.delta);
  for (const m of moves) {
    const t = m.createdAt.getTime();
    const active = all.filter((g) => g.createdAt.getTime() <= t && g.expiresAt.getTime() > t);
    if (m.delta < 0) {
      let need = -m.delta;
      for (const g of active) {
        if (need <= 0) break;
        const take = Math.min(need, g.delta - (drawn.get(g.id) ?? 0));
        if (take > 0) {
          drawn.set(g.id, (drawn.get(g.id) ?? 0) + take);
          need -= take;
        }
      }
    } else if (m.delta > 0) {
      let back = m.delta;
      for (const g of [...active].reverse()) {
        if (back <= 0) break;
        const give = Math.min(back, drawn.get(g.id) ?? 0);
        if (give > 0) {
          drawn.set(g.id, (drawn.get(g.id) ?? 0) - give);
          back -= give;
        }
      }
    }
  }
  const unused = Math.max(0, target.delta - (drawn.get(target.id) ?? 0));
  return Math.max(0, Math.min(unused, balance));
}

/** Expire every referral reward past expiresAt that has no `expire:<ledgerId>` row yet. Returns credits expired per grant. */
export async function sweepReferralExpiry(db: Db, now: Date = new Date()): Promise<Array<{ ledgerId: string; expired: number }>> {
  const due = await db.creditLedger.findMany({
    where: { reason: "referral_reward", expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    select: { id: true },
    take: 500,
  });
  if (!due.length) return [];
  const done = new Set(
    (await db.creditLedger.findMany({ where: { stripeRef: { in: due.map((d) => expireRef(d.id)) } }, select: { stripeRef: true } })).map((r) => r.stripeRef),
  );
  const out: Array<{ ledgerId: string; expired: number }> = [];
  for (const d of due) {
    if (done.has(expireRef(d.id))) continue;
    const expired = await db.$transaction(async (tx) => {
      const g = await tx.creditLedger.findUnique({ where: { id: d.id }, select: { id: true, workspaceId: true, delta: true, createdAt: true, expiresAt: true } });
      if (!g?.expiresAt) return null;
      const ws = await tx.$queryRaw<Array<{ creditBalance: number }>>`
        SELECT "creditBalance" FROM "AdsWorkspace" WHERE id = ${g.workspaceId} FOR UPDATE`;
      const balance = ws[0]?.creditBalance;
      if (balance === undefined) return null;
      if (await tx.creditLedger.findUnique({ where: { stripeRef: expireRef(g.id) }, select: { id: true } })) return null;
      const grants = (await tx.creditLedger.findMany({
        where: { workspaceId: g.workspaceId, reason: "referral_reward", expiresAt: { not: null }, createdAt: { lt: g.expiresAt } },
        select: { id: true, delta: true, createdAt: true, expiresAt: true },
      })).flatMap((r) => (r.expiresAt ? [{ ...r, expiresAt: r.expiresAt }] : []));
      const earliest = grants.reduce((m, r) => Math.min(m, r.createdAt.getTime()), g.createdAt.getTime());
      const movements = await tx.creditLedger.findMany({
        where: { workspaceId: g.workspaceId, reason: { in: ["reserve", "release"] }, createdAt: { gte: new Date(earliest), lt: g.expiresAt } },
        select: { delta: true, createdAt: true },
      });
      const amount = expiryAmount({ ...g, expiresAt: g.expiresAt }, grants, movements, balance);
      // A 0-credit row still marks the grant as processed (idempotency via stripeRef).
      await tx.creditLedger.create({
        data: { workspaceId: g.workspaceId, delta: -amount, balanceAfter: balance - amount, reason: "expire", stripeRef: expireRef(g.id), note: "referral credits expired" },
      });
      if (amount > 0) await tx.adsWorkspace.update({ where: { id: g.workspaceId }, data: { creditBalance: balance - amount } });
      return amount;
    });
    if (expired !== null) out.push({ ledgerId: d.id, expired });
  }
  return out;
}

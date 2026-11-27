// Owner-approved spending authority. Pure; other systems call checkSpend() BEFORE spending. This module never moves money:
// it only answers allow/deny. Changing a limit is an owner decision (edit here, commit).
export const SPEND_AUTHORITY = {
  /** Auto-allowed AI inference per UTC day across the engine (Codex flat subscription = marginal cost ~0; this caps API-priced fallbacks). */
  aiInferenceDailyCapCents: 1000,
  /** Any new paid service/subscription/tool: always needs the owner. */
  newPaidServiceCents: 0,
  /** Any increase of Meta daily budget: always needs the owner. */
  metaSpendIncreaseCents: 0,
} as const;

export type SpendKind = "ai_inference" | "new_paid_service" | "meta_spend_increase" | "other";
export type SpendRequest = { kind: SpendKind; amountCents: number; spentTodayCents?: number; system?: string; note?: string };
export type SpendDecision = { allowed: boolean; reason: string; needsOwner: boolean };

export function checkSpend(r: SpendRequest): SpendDecision {
  const amount = Number(r.amountCents);
  if (!Number.isFinite(amount) || amount < 0) return { allowed: false, needsOwner: true, reason: "invalid amount" };
  if (amount === 0) return { allowed: true, needsOwner: false, reason: "no cost" };
  switch (r.kind) {
    case "ai_inference": {
      const total = amount + Math.max(0, r.spentTodayCents ?? 0);
      return total <= SPEND_AUTHORITY.aiInferenceDailyCapCents
        ? { allowed: true, needsOwner: false, reason: `within the ${SPEND_AUTHORITY.aiInferenceDailyCapCents}c/day AI cap` }
        : { allowed: false, needsOwner: true, reason: `would exceed the ${SPEND_AUTHORITY.aiInferenceDailyCapCents}c/day AI cap` };
    }
    case "new_paid_service":
      return { allowed: amount <= SPEND_AUTHORITY.newPaidServiceCents, needsOwner: true, reason: "new paid services need owner approval" };
    case "meta_spend_increase":
      return { allowed: amount <= SPEND_AUTHORITY.metaSpendIncreaseCents, needsOwner: true, reason: "Meta spend increases need owner approval" };
    default:
      return { allowed: false, needsOwner: true, reason: "unlisted spend category: owner approval required" };
  }
}

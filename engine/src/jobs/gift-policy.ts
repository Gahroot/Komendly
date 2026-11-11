// Gift runs (AdRun.kind = "gift"): 3 free statics made for ANOTHER business's website, shown on /gift/<token>.
// Pure policy, no DB: auto-confirm (no review window), never a trial claim, never credits, no motion, no bonus,
// small attempt budget and wall-clock cap (the trial full-pack rules in trial-fill.ts/replace.ts don't apply).

export const GIFT_KIND = "gift";
/** Max static ads (originals + replacements) per gift run. */
export const GIFT_ATTEMPT_CAP = 6;
/** Replacements stop this long after confirm (auto-confirm = end of extraction). */
export const GIFT_FILL_MAX_MS = 10 * 60_000;

export function isGiftRun(run: { kind?: string | null }): boolean {
  return run.kind === GIFT_KIND;
}

// Nurture runs (AdRun.kind = "nurture"): the monthly "Ozzy made you a new ad" for an unpaid trial user's OWN site
// (lifecycle fresh_m* emails). Same free-run policy as gifts (auto-confirm, no claim, no credits, no motion, no bonus),
// 1 static, at most NURTURE_ATTEMPT_CAP attempts and NURTURE_COST_CAP_MICROS spend; the ready ad is then locked
// (visualBrief.locked, bonusKind "fresh") until the workspace pays. Hidden from the user's run/brand lists.
export const NURTURE_KIND = "nurture";
export const NURTURE_ATTEMPT_CAP = 3;
/** No replacement once the run has spent this much (USD micros); nurture runs are skipped when the estimate exceeds it. */
export const NURTURE_COST_CAP_MICROS = 600_000;
/** p90 measured job costs (dev DB, 2026-11-09): plan $0.049, render_static $0.206 + qc $0.016 (+ replan ~$0.03). */
export const NURTURE_EST_MICROS = { plan: 50_000, attempt: 250_000 } as const;

/** Estimated cost of the first try (plan + 1 static); the run is skipped when this alone exceeds the cap. */
export function nurtureFirstTryMicros(): number {
  return NURTURE_EST_MICROS.plan + NURTURE_EST_MICROS.attempt;
}

/** True when another attempt could push a nurture run over the cap. */
export function nurtureOverBudget(spentMicros: number | bigint): boolean {
  return Number(spentMicros) + NURTURE_EST_MICROS.attempt > NURTURE_COST_CAP_MICROS;
}

export function isNurtureRun(run: { kind?: string | null }): boolean {
  return run.kind === NURTURE_KIND;
}

/** Free side runs (gift or nurture): never credits, trial claims, motion or bonus. */
export function isFreeRun(run: { kind?: string | null }): boolean {
  return isGiftRun(run) || isNurtureRun(run);
}

export interface RunPolicy {
  /** Skip the confirm screen: extraction goes straight to queued. */
  autoConfirm: boolean;
  /** Record AdsTrialClaim / trialUsedAt on confirm. */
  claimTrial: boolean;
  /** Reserve / release / charge credits. */
  credits: boolean;
  /** Locked bonus ads after the pack. */
  bonus: boolean;
  /** Motion ads actually planned for a run that asked for `requested`. */
  motionCount(requested: number): number;
}

export function giftPolicy(run: { kind?: string | null; isTrial?: boolean }): RunPolicy {
  if (isFreeRun(run)) return { autoConfirm: true, claimTrial: false, credits: false, bonus: false, motionCount: () => 0 };
  return { autoConfirm: false, claimTrial: Boolean(run.isTrial), credits: true, bonus: Boolean(run.isTrial), motionCount: (n) => n };
}

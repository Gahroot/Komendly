// Growth-program numbers for lifecycle copy. Kept here (no package imports) so the engine can import them;
// must match src/lib/ads/referrals.ts (REFERRED_TRIAL_STATIC, REFERRER_REWARD_CREDITS, ...): a test asserts it.
export const REFERRAL_FACTS = { referredTrial: 20, reward: 10, expiryDays: 30, monthlyCap: 5, freeMonthAfter: 3 } as const;

/** Rough "is this an agency / freelancer site" check on the extraction text (for the day-30 Agency pitch). */
export function looksLikeAgency(text: string): boolean {
  return /\b(agency|agencies|freelanc\w*|marketing studio|creative studio|digital studio|consultan(cy|t|ts)|media buyer|we help (brands|businesses|clients)|our clients|white[- ]label)\b/i.test(text);
}

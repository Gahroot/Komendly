// Emergency stop: which flags "pause all outbound" turns off. Pure plan + reversible (resume restores exactly what was on).
// Deliberately only SENDING/POSTING/outreach flags. Inbound handling, billing, delivery and monitoring keep running.
export const EMERGENCY_FLAGS = [
  "outbound", "lifecycle_email", "sys_creative_outreach", "sys_creative_publish", "sys_reels", "sys_nurture", "sys_review_gifts", "sys_ad_watch",
  "sys_reactivation", "sys_expansion", "sys_winback", "sys_checkout_recovery", "sys_optimizer_digest", "sys_revenue_digest", "sys_ops_digest", "sys_ai_assistant", "sys_activation", "sys_proof", "sys_cancel_save",
] as const;
export const EMERGENCY_EVENT = "ops_emergency_stop";

export interface StopPlan { turnOff: string[]; alreadyOff: string[] }

export function planStop(flags: Record<string, boolean>): StopPlan {
  const turnOff = EMERGENCY_FLAGS.filter((k) => flags[k]);
  return { turnOff: [...turnOff], alreadyOff: EMERGENCY_FLAGS.filter((k) => !flags[k]) };
}

/** Resume restores only what the matching stop turned off (stored in the stop event). */
export function planResume(stopProps: unknown): string[] {
  const off = (stopProps as { turnedOff?: unknown } | null)?.turnedOff;
  return Array.isArray(off) ? off.filter((k): k is string => typeof k === "string" && (EMERGENCY_FLAGS as readonly string[]).includes(k)) : [];
}

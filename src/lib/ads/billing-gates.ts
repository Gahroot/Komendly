// Paid feature gates. Pure: takes the workspace fields it needs.
import { AWARENESS_LEVELS, RATIOS, TRIAL_RATIOS, type Awareness, type Ratio } from "./contracts";

export interface PaidCheckWorkspace {
  adsPlan: string;
  subscriptionStatus: string;
  suspendedAt?: Date | null;
}

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]); // past_due keeps access during dunning

export function isPaidWorkspace(ws: PaidCheckWorkspace): boolean {
  return ws.adsPlan !== "trial" && PAID_STATUSES.has(ws.subscriptionStatus) && !ws.suspendedAt;
}

export function allowedRatios(ws: PaidCheckWorkspace): Ratio[] {
  return isPaidWorkspace(ws) ? [...RATIOS] : [...TRIAL_RATIOS];
}

export function allowedAwarenessLevels(ws: PaidCheckWorkspace): Awareness[] {
  return isPaidWorkspace(ws) ? [...AWARENESS_LEVELS] : ["problem_aware", "solution_aware"];
}

/** Meta publishing additionally requires the meta_publish feature flag (checked by the caller). */
export function canPublishToMeta(ws: PaidCheckWorkspace): boolean {
  return isPaidWorkspace(ws);
}

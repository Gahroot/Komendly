// Ozzy Ad Coach access rules. Pure (no I/O): the caller passes the workspace fields + counts.
import { hasAdDepartment, type PlanCheckWorkspace } from "../billing-config";
import { isPaidWorkspace } from "../billing-gates";
import { COACH_LIMITS } from "./contracts";

export type CoachAccess =
  | { mode: "unlimited"; canReview: boolean; reason: "ok" | "daily_limit" }
  | { mode: "one_free"; canReview: boolean; reason: "ok" | "free_used" }
  | { mode: "sample"; canReview: false; reason: "trial" };

/**
 * Ad Department: unlimited (COACH_LIMITS.perDay per rolling 24 h). Other paid plans: one free review, then upsell.
 * Trial / unpaid: sample verdict + upgrade CTA. `freeUsed` = reviews ever started with free=true; `last24h` = reviews started in 24 h.
 */
export function coachAccess(ws: PlanCheckWorkspace, counts: { freeUsed: number; last24h: number }): CoachAccess {
  if (hasAdDepartment(ws)) {
    const ok = counts.last24h < COACH_LIMITS.perDay;
    return { mode: "unlimited", canReview: ok, reason: ok ? "ok" : "daily_limit" };
  }
  if (isPaidWorkspace(ws)) {
    const ok = counts.freeUsed < 1;
    return { mode: "one_free", canReview: ok, reason: ok ? "ok" : "free_used" };
  }
  return { mode: "sample", canReview: false, reason: "trial" };
}

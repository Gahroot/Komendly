// Owner-set limits for the executive layer. READ-ONLY constants: nothing in src/lib/exec may raise or edit them (tested).
// Money limits come from src/lib/ops/finance/authority.ts (single source); these add the non-money limits.
import { SPEND_AUTHORITY } from "../ops/finance/authority";

export const EXEC_AUTHORITY = {
  newPaidServiceCents: SPEND_AUTHORITY.newPaidServiceCents, // 0
  metaSpendCents: 0, // ads are OFF until there is proof; the owner changes this, never the system
  metaSpendIncreaseCents: SPEND_AUTHORITY.metaSpendIncreaseCents,
  aiInferenceDailyCapCents: SPEND_AUTHORITY.aiInferenceDailyCapCents,
  /** Weekly AI call budget for the whole executive layer (opportunity pass + anything it triggers). */
  execAiCallsPerWeek: 6,
  /** Max dispatch actions executed per objective per week. */
  maxDispatchPerObjectiveWeek: 5,
  maxActiveObjectives: 3,
  maxOpportunitiesPerWeek: 3,
} as const;

/** Flags the coordinator may switch ON (read-only / intelligence systems; none of them contacts customers or spends). */
export const FLAG_ALLOW_ON: readonly string[] = [
  "sys_revenue_intel", "sys_ops_control", "sys_offer_intel", "sys_customer_memory", "sys_reliability", "sys_delivery_econ",
  "sys_competitive", "sys_product_loop", "sys_creative_qa", "sys_outcome_verify", "sys_content_queue", "sys_funnel_monitor",
];
/** Flags the coordinator may switch OFF (to stop a resource drain). Reversible. Protected ones are never touched. */
export const FLAG_PROTECTED: readonly string[] = [
  "sys_incidents", "sys_ops_control", "sys_funnel_monitor", "sys_reliability", "sys_checkout_recovery", "sys_winback", "sys_activation",
  "sys_guarantee_watch", "sys_cancel_save", "sys_exec_coordinator", "sys_exec_brief", "sys_infra_watch", "sys_support_ops",
];
/** Never switched by the executive layer in either direction: sending, publishing, governor-controlled or owner-controlled. */
export const FLAG_NEVER_TOUCH = /(^outbound$|outbound|^meta_publish$|lifecycle_email|^ezmotion$|kly|governor|send|mail|digest|spend|billing|stripe)/i;

export function flagChangeAllowed(key: string, enabled: boolean): { ok: boolean; reason: string } {
  if (!/^sys_[a-z0-9_]+$/.test(key)) return { ok: false, reason: "only sys_* growth-system flags can be switched by the coordinator" };
  if (FLAG_NEVER_TOUCH.test(key)) return { ok: false, reason: "sending/publishing/governed flags are owner-controlled" };
  if (FLAG_PROTECTED.includes(key)) return { ok: false, reason: "protected flag (revenue-critical or safety)" };
  if (enabled && !FLAG_ALLOW_ON.includes(key)) return { ok: false, reason: "not on the allow-list for switching ON" };
  return { ok: true, reason: enabled ? "allow-listed intelligence system" : "reversible stop of a non-protected system" };
}

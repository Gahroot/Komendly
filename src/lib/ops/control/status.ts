// Pure status rule for the system accountability ledger. No Next/Prisma/Node imports (engine imports this).
import type { SystemBeat } from "../../growth/systems";

export type CapabilityStatus = "operational" | "idle_by_design" | "off" | "failing" | "silent" | "unproven";

export interface StatusInput {
  /** AdsFeatureFlag state; null = the capability has no flag (always on). */
  enabled: boolean | null;
  beat: SystemBeat | null;
  /** Newest AdsEvent marker for this capability (digest sent, snapshot written...). */
  lastMarkerAt: Date | null;
  /** Outputs in the window (marker events), null = no marker events defined. */
  outputs7d: number | null;
  outputs30d: number | null;
  /** Expected run cadence in hours; stale = last evidence older than 3 cycles. */
  cycleHours: number;
  /** Output is only produced when something happens (event-driven); no output is then normal. */
  idleOk?: boolean;
  /** Flag-less capability whose telemetry doesn't exist at all (can't be proven from data). */
  noTelemetry?: boolean;
  now: Date;
}

export interface StatusResult { status: CapabilityStatus; reason: string; lastRunAt: string | null }

const t = (s: string | Date | null | undefined) => (s ? new Date(s).getTime() : 0);

export function capabilityStatus(i: StatusInput): StatusResult {
  const beatRun = t(i.beat?.lastRunAt), marker = t(i.lastMarkerAt);
  const lastRun = Math.max(beatRun, marker);
  const lastRunAt = lastRun ? new Date(lastRun).toISOString() : null;
  const r = (status: CapabilityStatus, reason: string): StatusResult => ({ status, reason, lastRunAt });
  if (i.enabled === false) return r("off", "flag is off");
  if (i.beat?.lastError && beatRun > t(i.beat.lastOkAt)) return r("failing", `last run errored: ${i.beat.lastError.slice(0, 120)}`);
  if (!lastRun) {
    if (i.noTelemetry) return r("unproven", "no heartbeat or marker exists for this capability; cannot be proven from data");
    return r("silent", i.enabled ? "enabled but never ran (no heartbeat, no output event): implemented is not operational" : "never ran (no heartbeat, no output event)");
  }
  const staleMs = 3 * i.cycleHours * 3_600_000;
  if (i.now.getTime() - lastRun > staleMs) return r("failing", `stale: last evidence ${Math.round((i.now.getTime() - lastRun) / 3_600_000)}h ago, expected every ${i.cycleHours}h`);
  const producedRecently = (i.outputs30d ?? 0) > 0 || (i.beat?.outputs ?? 0) > 0 && t(i.beat?.lastOutputAt) > i.now.getTime() - 30 * 86_400_000;
  if (producedRecently) return r("operational", "ran on schedule and produced outputs in the last 30 days");
  if (i.idleOk) return r("idle_by_design", "ran on schedule; output only happens when a trigger occurs, none yet");
  return r("unproven", "ran on schedule but has produced no outcome evidence yet");
}

export type FindingKind = "enabled_but_silent" | "failing" | "cost_without_outcome" | "registry_mismatch" | "unproven";
export interface Finding { kind: FindingKind; id: string; message: string; severity: "high" | "medium" | "low" }

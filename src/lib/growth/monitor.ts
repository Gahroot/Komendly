// System-failure alert decisions (pure; imported by the engine monitor loop and the admin money dashboard).
// One alert per incident: the monitor stores alertedAt/alertReason in the system heartbeat meta (SystemBeat) and
// sends a "recovered" note once the system is healthy again. Codex provider state lives in the monitor's own beat.
import { GROWTH_SYSTEMS, systemHealth, type GrowthSystem, type SystemBeat, type SystemHealth } from "./systems";

export const MONITOR_HEARTBEAT_ID = "monitor:alerts";
export const MONITOR_CYCLE_MINUTES = 10;
/** The engine writes provider:codex every few seconds; older than this = engine/provider not reporting. */
export const PROVIDER_STALE_MINUTES = 15;

export const ALERT_HEALTH: readonly SystemHealth[] = ["failing", "stalled", "silent"];

export type AlertDecision =
  | { action: "none" }
  | { action: "alert"; reason: string }
  | { action: "recover"; reason: string }
  /** Turned off while alerted: clear state silently. */
  | { action: "clear" };

export function healthReason(health: SystemHealth, beat: SystemBeat | null): string {
  if (health === "failing") return `failing: ${beat?.lastError ?? "last run errored"}`;
  if (health === "stalled") return `stalled: no run since ${beat?.lastRunAt ?? "?"}`;
  if (health === "silent") return `silent: no output since ${beat?.lastOutputAt ?? beat?.firstRunAt ?? "?"}`;
  return health;
}

/** Pure: what to do for one system this tick. Re-alerts only when the incident kind changes (e.g. stalled -> failing). */
export function decideSystemAlert(sys: GrowthSystem, enabled: boolean, beat: SystemBeat | null, now: Date): { health: SystemHealth; decision: AlertDecision } {
  const health = systemHealth(sys, enabled, beat, now);
  const alerted = Boolean(beat?.alertedAt);
  if (ALERT_HEALTH.includes(health)) {
    const reason = healthReason(health, beat);
    const kind = (r: string | null | undefined) => (r ?? "").split(":")[0];
    if (!alerted || kind(beat?.alertReason) !== health) return { health, decision: { action: "alert", reason } };
    return { health, decision: { action: "none" } };
  }
  if (alerted && health === "healthy") return { health, decision: { action: "recover", reason: beat?.alertReason ?? "" } };
  if (alerted && health === "off") return { health, decision: { action: "clear" } };
  return { health, decision: { action: "none" } };
}

export interface ProviderBeat { ok: boolean; message: string | null; updatedAt: Date }

/** Pure: Codex provider heartbeat problem, or null when fine. */
export function providerProblem(beat: ProviderBeat | null, now: Date): string | null {
  if (!beat) return "no provider:codex heartbeat";
  if (now.getTime() - beat.updatedAt.getTime() > PROVIDER_STALE_MINUTES * 60_000) return `provider:codex heartbeat stale since ${beat.updatedAt.toISOString()}`;
  if (!beat.ok) return `Codex not ok: ${beat.message ?? "unknown"}`;
  return null;
}

export function decideProviderAlert(problem: string | null, alertedAt: string | null | undefined): AlertDecision {
  if (problem && !alertedAt) return { action: "alert", reason: problem };
  if (!problem && alertedAt) return { action: "recover", reason: "" };
  return { action: "none" };
}

export interface MonitorBeat {
  lastRunAt: string | null;
  runs: number;
  alertsSent: number;
  lastAlertAt: string | null;
  lastError: string | null;
  codexAlertedAt: string | null;
  codexAlertReason: string | null;
}

export function parseMonitorBeat(meta: unknown): MonitorBeat {
  const m = (meta && typeof meta === "object" ? meta : {}) as Partial<MonitorBeat>;
  return { lastRunAt: m.lastRunAt ?? null, runs: m.runs ?? 0, alertsSent: m.alertsSent ?? 0, lastAlertAt: m.lastAlertAt ?? null, lastError: m.lastError ?? null, codexAlertedAt: m.codexAlertedAt ?? null, codexAlertReason: m.codexAlertReason ?? null };
}

/** Pure: monitor health (the monitor is not a registry system; stalled after 3 missed cycles). */
export function monitorHealth(beat: MonitorBeat | null, now: Date): "healthy" | "never_ran" | "failing" | "stalled" {
  if (!beat?.lastRunAt) return "never_ran";
  if (now.getTime() - new Date(beat.lastRunAt).getTime() > 3 * MONITOR_CYCLE_MINUTES * 60_000) return "stalled";
  return beat.lastError ? "failing" : "healthy";
}

/** Pure: the founder email for one alert decision. */
export function alertEmail(what: string, d: AlertDecision, adminUrl: string): { subject: string; text: string } | null {
  if (d.action === "alert") return { subject: `[Komendly] SYSTEM DOWN: ${what}`.slice(0, 120), text: `${what} needs attention.\n\n${d.reason}\n\nDashboard: ${adminUrl}` };
  if (d.action === "recover") return { subject: `[Komendly] Recovered: ${what}`.slice(0, 120), text: `${what} is healthy again.${d.reason ? `\n\nWas: ${d.reason}` : ""}\n\nDashboard: ${adminUrl}` };
  return null;
}

export { GROWTH_SYSTEMS };

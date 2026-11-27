// System accountability ledger: one row per autonomous capability + findings. Pure; facts are loaded elsewhere (loader.ts).
import type { SystemBeat } from "../../growth/systems";
import { CAPABILITIES, type Capability } from "./inventory";
import { capabilityStatus, type CapabilityStatus, type Finding } from "./status";

export interface EventFacts { last: string | null; n7: number; n30: number }
export interface LedgerFacts {
  now: Date;
  /** AdsFeatureFlag key -> enabled (missing key = off). */
  flags: Record<string, boolean>;
  beats: Record<string, SystemBeat | undefined>;
  events: Record<string, EventFacts | undefined>;
  /** Codex calls by system key in the last 7 days / AI cost micros in the last 30 (from `ai_call` AdsEvents; absent = not tracked). */
  aiCalls7d?: Record<string, number>;
  aiCostMicros30d?: Record<string, number>;
}

export interface LedgerRow {
  id: string; kind: Capability["kind"]; label: string; purpose: string; area: string;
  flag: string | null; flagOn: boolean | null;
  status: CapabilityStatus; reason: string;
  lastRunAt: string | null; lastOkAt: string | null; lastError: string | null; runs: number;
  outputs7d: number | null; outputs30d: number | null;
  aiCalls7d: number | null; costMicros30d: number | null;
  revenueCritical: boolean; where: string;
}

const sysKey = (c: Capability) => (c.kind === "system" ? c.id.slice("system:".length) : c.id);

export function buildLedger(f: LedgerFacts, caps: readonly Capability[] = CAPABILITIES): { rows: LedgerRow[]; findings: Finding[]; counts: Record<CapabilityStatus, number> } {
  const rows: LedgerRow[] = caps.map((c) => {
    const beat = (c.heartbeat && f.beats[c.heartbeat]) || null;
    const evs = c.markers.map((m) => f.events[m]).filter((e): e is EventFacts => Boolean(e));
    const lastMarker = evs.map((e) => e.last).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
    const has = c.markers.length > 0;
    const o7 = has ? evs.reduce((a, e) => a + e.n7, 0) : null, o30 = has ? evs.reduce((a, e) => a + e.n30, 0) : null;
    const enabled = c.flag ? Boolean(f.flags[c.flag]) : null;
    const st = capabilityStatus({ enabled, beat, lastMarkerAt: lastMarker ? new Date(lastMarker) : null, outputs7d: o7, outputs30d: o30, cycleHours: c.cycleHours, idleOk: c.idleOk, noTelemetry: c.noTelemetry && !beat && !has, now: f.now });
    const k = sysKey(c);
    return {
      id: c.id, kind: c.kind, label: c.label, purpose: c.purpose, area: c.area, flag: c.flag, flagOn: enabled, status: st.status, reason: st.reason,
      lastRunAt: st.lastRunAt, lastOkAt: beat?.lastOkAt ?? null, lastError: beat?.lastError ?? null, runs: beat?.runs ?? 0, outputs7d: o7, outputs30d: o30,
      aiCalls7d: f.aiCalls7d ? (f.aiCalls7d[k] ?? 0) : null, costMicros30d: f.aiCostMicros30d ? (f.aiCostMicros30d[k] ?? 0) : null,
      revenueCritical: c.revenueCritical, where: c.where,
    };
  });
  const counts = { operational: 0, idle_by_design: 0, off: 0, failing: 0, silent: 0, unproven: 0 } as Record<CapabilityStatus, number>;
  const findings: Finding[] = [];
  for (const r of rows) {
    counts[r.status]++;
    if (r.status === "silent" && r.flagOn) findings.push({ kind: "enabled_but_silent", id: r.id, severity: r.revenueCritical ? "high" : "medium", message: `${r.label}: switched on but has never run. ${r.reason}` });
    else if (r.status === "failing") findings.push({ kind: "failing", id: r.id, severity: r.revenueCritical ? "high" : "medium", message: `${r.label}: ${r.reason}` });
    else if (r.status === "unproven" && r.flagOn) findings.push({ kind: "unproven", id: r.id, severity: "low", message: `${r.label}: running, but no outcome evidence yet.` });
    if ((r.costMicros30d ?? 0) > 0 && (r.outputs30d ?? 0) === 0 && r.status !== "operational") findings.push({ kind: "cost_without_outcome", id: r.id, severity: "medium", message: `${r.label}: spent ~$${((r.costMicros30d ?? 0) / 1e6).toFixed(2)} of AI in 30 days with zero outputs.` });
  }
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { rows, findings, counts };
}

export interface RegistryItem { id: number | string; name: string; status: string; flag?: string | null }

/** Cross-check registry claims ("operational") against ledger reality. Returns proposals only: never edit the registry silently. */
export function registryDiscrepancies(items: readonly RegistryItem[], rows: readonly LedgerRow[], flags: Record<string, boolean>): Finding[] {
  const byFlag = new Map(rows.filter((r) => r.flag).map((r) => [r.flag as string, r]));
  const out: Finding[] = [];
  for (const it of items) {
    if (it.status !== "operational" || !it.flag) continue;
    const id = `registry:${it.id}`;
    const row = byFlag.get(it.flag);
    if (!(it.flag in flags) || !flags[it.flag]) { out.push({ kind: "registry_mismatch", id, severity: "medium", message: `Registry says "${it.name}" is operational but flag ${it.flag} is ${it.flag in flags ? "OFF" : "missing (= off)"}. Propose: set status to awaiting_prerequisite or switch the flag on.` }); continue; }
    if (row && (row.status === "silent" || row.status === "failing")) out.push({ kind: "registry_mismatch", id, severity: "high", message: `Registry says "${it.name}" is operational but the ledger shows it ${row.status} (${row.reason}). Propose: downgrade until it runs.` });
    else if (row && row.status === "unproven") out.push({ kind: "registry_mismatch", id, severity: "low", message: `Registry says "${it.name}" is operational; ledger finds it runs but has no outcome evidence yet. Propose: relabel as experimenting.` });
  }
  return out;
}

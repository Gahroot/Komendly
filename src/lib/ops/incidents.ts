// Incident engine (pure; no Next/Prisma). Signals in -> open/update/close `incident` AdsEvent records out.
// Containment is limited to an allow-list of reversible actions; everything else escalates to the owner.
// The engine job (engine/src/ops/incidents.ts) does the I/O.
import { GROWTH_SYSTEMS, type SystemBeat, type SystemHealth } from "../growth/systems";

export const INCIDENT_EVENT = "incident";
export const OWNER_EMAIL = "nolan@prestyj.com";
export const MAINTENANCE_FLAG = "ops_maintenance";
export const RESOLVE_AFTER_CLEAN_MS = 25 * 60_000; // ~2 clean 10-min ticks
export const MAX_CONTAINMENTS_PER_TICK = 3;
export const RECURRENCE_WINDOW_DAYS = 30;

export type Severity = "P1" | "P2" | "P3";
export type SignalType = "funnel" | "heartbeat" | "reliability" | "kly" | "webhook" | "provider" | "deliverability" | "payment" | "system" | "support" | "infra";
export type IncidentStatus = "open" | "contained" | "resolved";

export type Containment =
  | { kind: "flag_off"; key: string }
  | { kind: "pause_domain"; domain: string }
  | { kind: "maintenance_on" };

export interface Signal { key: string; type: SignalType; severity: Severity; title: string; detail: string; containment?: Containment[] }

/** Severity from impact: security or money at risk or everyone affected = P1; some customers = P2; otherwise P3. */
export function classifySeverity(i: { customers: "none" | "some" | "all"; financial?: boolean; security?: boolean }): Severity {
  if (i.security || i.financial || i.customers === "all") return "P1";
  if (i.customers === "some") return "P2";
  return "P3";
}

/** Flags automation may never switch off (it would blind or disable the ops system itself). */
export const PROTECTED_FLAGS = new Set(["sys_incidents", "sys_support_ops", "sys_infra_watch", "sys_funnel_monitor", "sys_reliability", "sys_revenue_intel"]);

export function containmentAllowed(c: Containment): boolean {
  if (c.kind === "maintenance_on") return true;
  if (c.kind === "pause_domain") return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.domain);
  if (c.kind === "flag_off") return /^sys_[a-z0-9_]+$/.test(c.key) && !PROTECTED_FLAGS.has(c.key) && GROWTH_SYSTEMS.some((s) => `sys_${s.key}` === c.key);
  return false;
}
export const containmentKey = (c: Containment) => (c.kind === "flag_off" ? `flag_off:${c.key}` : c.kind === "pause_domain" ? `pause_domain:${c.domain}` : "maintenance_on");

export interface IncidentRec {
  /** AdsEvent id (null before it is created). */
  eventId: string | null;
  incidentId: string; key: string; type: SignalType; severity: Severity; title: string; status: IncidentStatus;
  detectedAt: string; lastSeenAt: string;
  signals: { at: string; detail: string }[];
  containment: { action: string; at: string; ok: boolean }[];
  resolvedAt: string | null; rootCause: string | null; correctiveAction: string | null;
  recurrence: number; escalatedAt: string | null;
}

const SEV_RANK: Record<Severity, number> = { P1: 3, P2: 2, P3: 1 };

export interface ReconcileInput { now: Date; open: IncidentRec[]; resolvedRecent: IncidentRec[]; signals: Signal[]; evaluated: ReadonlySet<SignalType> }
export interface ReconcilePlan {
  create: IncidentRec[];
  update: { rec: IncidentRec }[];
  /** containment to execute now (allow-listed, capped, not already applied). */
  contain: { incidentId: string; action: Containment }[];
  /** containment proposals that were refused (not allow-listed): the owner must decide. */
  refused: { incidentId: string; action: Containment }[];
  /** incidents the owner is emailed about (P1, or containment out of bounds), once per incident. */
  escalate: { rec: IncidentRec; reason: string }[];
  /** reversible containment to undo as the incident closes (maintenance banner only; flags stay for the owner). */
  undo: { incidentId: string; action: Containment }[];
}

let seq = 0;
const newId = (now: Date, key: string) => `inc_${now.getTime().toString(36)}_${(seq++ % 1296).toString(36)}_${key.replace(/[^a-z0-9]+/gi, "").slice(0, 8).toLowerCase()}`;

export function reconcile(inp: ReconcileInput): ReconcilePlan {
  const { now } = inp;
  const at = now.toISOString();
  const plan: ReconcilePlan = { create: [], update: [], contain: [], refused: [], escalate: [], undo: [] };
  const openByKey = new Map(inp.open.map((r) => [r.key, r]));
  const byKey = new Map<string, Signal>();
  for (const s of inp.signals) { const prev = byKey.get(s.key); if (!prev || SEV_RANK[s.severity] > SEV_RANK[prev.severity]) byKey.set(s.key, { ...s, containment: [...(prev?.containment ?? []), ...(s.containment ?? [])] }); }
  const signals = [...byKey.values()];
  const active = new Set(byKey.keys());
  let budget = MAX_CONTAINMENTS_PER_TICK;

  for (const s of signals) {
    let rec = openByKey.get(s.key);
    let isNew = false;
    if (!rec) {
      isNew = true;
      const cutoff = now.getTime() - RECURRENCE_WINDOW_DAYS * 86_400_000;
      const recurrence = inp.resolvedRecent.filter((r) => r.key === s.key && Date.parse(r.detectedAt) >= cutoff).length;
      rec = { eventId: null, incidentId: newId(now, s.key), key: s.key, type: s.type, severity: s.severity, title: s.title, status: "open", detectedAt: at, lastSeenAt: at, signals: [], containment: [], resolvedAt: null, rootCause: null, correctiveAction: null, recurrence, escalatedAt: null };
    } else {
      rec = { ...rec, signals: [...rec.signals], containment: [...rec.containment] };
    }
    rec.lastSeenAt = at;
    if (SEV_RANK[s.severity] > SEV_RANK[rec.severity]) rec.severity = s.severity;
    const last = rec.signals[rec.signals.length - 1];
    if (!last || last.detail !== s.detail) rec.signals = [...rec.signals, { at, detail: s.detail.slice(0, 300) }].slice(-5);

    let outOfBounds: string | null = null;
    for (const c of s.containment ?? []) {
      if (rec.containment.some((x) => x.action === containmentKey(c))) continue;
      if (!containmentAllowed(c)) { plan.refused.push({ incidentId: rec.incidentId, action: c }); outOfBounds = `containment not allowed: ${containmentKey(c)}`; continue; }
      if (budget <= 0) continue;
      budget--;
      plan.contain.push({ incidentId: rec.incidentId, action: c });
      rec.containment.push({ action: containmentKey(c), at, ok: true });
      rec.status = "contained";
    }
    const reason = rec.severity === "P1" ? "P1 incident" : outOfBounds;
    if (reason && !rec.escalatedAt) { rec.escalatedAt = at; plan.escalate.push({ rec, reason }); }
    if (isNew) plan.create.push(rec); else plan.update.push({ rec });
  }

  for (const r of inp.open) {
    if (active.has(r.key) || !inp.evaluated.has(r.type)) continue;
    if (now.getTime() - Date.parse(r.lastSeenAt) < RESOLVE_AFTER_CLEAN_MS) continue;
    const closed: IncidentRec = { ...r, status: "resolved", resolvedAt: at, rootCause: r.rootCause ?? `Cleared by itself; last seen: ${r.signals[r.signals.length - 1]?.detail ?? r.title}`, correctiveAction: r.correctiveAction ?? (r.containment.length ? "Containment applied; review whether to keep it." : "None needed yet; see the daily review if it recurs.") };
    plan.update.push({ rec: closed });
    if (r.containment.some((c) => c.action === "maintenance_on")) plan.undo.push({ incidentId: r.incidentId, action: { kind: "maintenance_on" } });
  }
  return plan;
}

// ---- signal builders (pure) ----

const mins = (ms: number) => Math.round(ms / 60_000);
const ageMs = (d: Date | null | undefined, now: Date) => (d ? now.getTime() - d.getTime() : Infinity);

export function fromFunnelCheck(ev: { ok: boolean; failures: { name: string; detail: string }[] } | null): Signal[] {
  if (!ev || ev.ok) return [];
  return ev.failures.map((f) => {
    const money = /stripe|coupon|price|offer/i.test(f.name);
    return { key: `funnel:${f.name}`.slice(0, 120), type: "funnel" as const, severity: money ? "P1" as const : "P2" as const, title: `Funnel check failing: ${f.name}`, detail: f.detail };
  });
}

export function fromHeartbeats(b: { engineWorkerAt: Date | null; klyAt: Date | null; codex: { ok: boolean; message: string | null; updatedAt: Date } | null }, now: Date): Signal[] {
  const out: Signal[] = [];
  if (ageMs(b.engineWorkerAt, now) > 5 * 60_000) out.push({ key: "heartbeat:engine", type: "heartbeat", severity: classifySeverity({ customers: "all" }), title: "Engine is not reporting", detail: b.engineWorkerAt ? `no engine heartbeat for ${mins(ageMs(b.engineWorkerAt, now))} min` : "no engine heartbeat on record", containment: ageMs(b.engineWorkerAt, now) > 15 * 60_000 ? [{ kind: "maintenance_on" }] : [] });
  if (ageMs(b.klyAt, now) > 10 * 60_000) out.push({ key: "heartbeat:kly", type: "heartbeat", severity: "P2", title: "Kly (cold email) is not reporting", detail: b.klyAt ? `no kly heartbeat for ${mins(ageMs(b.klyAt, now))} min` : "no kly heartbeat on record" });
  if (b.codex && (!b.codex.ok || ageMs(b.codex.updatedAt, now) > 15 * 60_000)) out.push({ key: "provider:codex", type: "provider", severity: "P2", title: "Codex AI provider is unhealthy", detail: !b.codex.ok ? `Codex not ok: ${b.codex.message ?? "unknown"}` : `provider heartbeat stale ${mins(ageMs(b.codex.updatedAt, now))} min` });
  return out;
}

export interface DomainFacts { domain: string; paused: boolean; pausedReason: string | null; listedOn: string[]; failStreak: number }
export function fromDomains(ds: DomainFacts[]): Signal[] {
  const out: Signal[] = [];
  for (const d of ds) {
    if (d.listedOn.length) out.push({ key: `deliverability:blocklist:${d.domain}`, type: "deliverability", severity: "P2", title: `${d.domain} is on a blocklist`, detail: `listed on ${d.listedOn.join(", ")}`, containment: d.paused ? [] : [{ kind: "pause_domain", domain: d.domain }] });
    else if (d.paused && d.pausedReason?.startsWith("auto:")) out.push({ key: `kly:paused:${d.domain}`, type: "kly", severity: "P3", title: `Kly governor paused ${d.domain}`, detail: d.pausedReason });
  }
  return out;
}

export function fromReliabilityFindings(fs: { key: string; severity: number; title: string; detail: string }[]): Signal[] {
  return fs.map((f) => ({ key: `reliability:${f.key}`.slice(0, 120), type: "reliability" as const, severity: f.severity <= 1 ? "P1" as const : f.severity === 2 ? "P2" as const : "P3" as const, title: f.title, detail: f.detail }));
}

export function fromPayments(failed24h: number, webhookFailed1h: { provider: string; n: number }[]): Signal[] {
  const out: Signal[] = [];
  if (failed24h >= 3) out.push({ key: "payment:failures", type: "payment", severity: "P1", title: "Several payment failures in 24h", detail: `${failed24h} payment-failed alerts in 24h; check Stripe and the card-update emails` });
  for (const w of webhookFailed1h) if (w.n > 0) out.push({ key: `webhook:${w.provider}`, type: "webhook", severity: /stripe/i.test(w.provider) ? "P1" : "P2", title: `${w.provider} webhook failures`, detail: `${w.n} failed deliveries in the last hour` });
  return out;
}

/** Growth systems failing for real. An email-sending system that keeps failing is switched off (reversible by the owner). */
const EMAIL_SYSTEMS = new Set(["checkout_recovery", "winback", "nurture", "activation", "activation_rescue", "proof", "reactivation", "expansion", "cancel_save", "review_gifts", "ad_watch", "meta_results", "creative_outreach"]);
export function fromSystems(rows: { key: string; enabled: boolean; health: SystemHealth; beat: SystemBeat | null }[], now: Date): Signal[] {
  const out: Signal[] = [];
  for (const r of rows) {
    if (!r.enabled || r.health !== "failing") continue;
    const stuck = (r.beat?.runs ?? 0) >= 3 && ageMs(r.beat?.lastOkAt ? new Date(r.beat.lastOkAt) : null, now) > 60 * 60_000;
    out.push({ key: `system:${r.key}`, type: "system", severity: "P3", title: `Growth system failing: ${r.key}`, detail: r.beat?.lastError ?? "last run errored", containment: stuck && EMAIL_SYSTEMS.has(r.key) ? [{ kind: "flag_off", key: `sys_${r.key}` }] : [] });
  }
  return out;
}

export function fromSupport(h: { unanswered: number; withOutcome: number; ownerOverdue: number }): Signal[] {
  const out: Signal[] = [];
  if (h.unanswered >= 3 && h.withOutcome === 0) out.push({ key: "support:auto_reply_silent", type: "support", severity: "P2", title: "Auto-responder produced no outcomes", detail: `${h.unanswered} customer replies are past the 15 min SLA with no auto-reply or flag` });
  if (h.ownerOverdue > 0) out.push({ key: "support:owner_backlog", type: "support", severity: "P3", title: "Support items waiting on the owner past due", detail: `${h.ownerOverdue} item(s) in /admin/ads/support are overdue` });
  return out;
}

// ---- daily review: recurrence -> permanent fix proposals ----

export interface Proposal { key: string; title: string; why: string; severity: number; commercial: number; effort: "S" | "M" | "L"; customers: number; area: string }
export function reviewIncidents(all: IncidentRec[], now: Date): { opened: number; resolved: number; byType: Record<string, number>; proposals: Proposal[] } {
  const cutoff = now.getTime() - RECURRENCE_WINDOW_DAYS * 86_400_000;
  const recent = all.filter((r) => Date.parse(r.detectedAt) >= cutoff);
  const byKey = new Map<string, IncidentRec[]>();
  for (const r of recent) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  const byType: Record<string, number> = {};
  for (const r of recent) byType[r.type] = (byType[r.type] ?? 0) + 1;
  const proposals: Proposal[] = [];
  for (const [key, rs] of byKey) {
    if (rs.length < 2) continue;
    const top = rs.reduce((a, b) => (SEV_RANK[b.severity] > SEV_RANK[a.severity] ? b : a));
    const sev = top.severity === "P1" ? 5 : top.severity === "P2" ? 4 : 3;
    proposals.push({ key, title: `Permanent fix: ${top.title} (${rs.length} incidents in ${RECURRENCE_WINDOW_DAYS} days)`, why: `Same signal "${key}" opened ${rs.length} times. Last root cause: ${rs.map((r) => r.rootCause).filter(Boolean).pop() ?? "unknown"}. Stop relying on auto-recovery and fix the cause.`, severity: sev, commercial: sev >= 4 ? 4 : 3, effort: "M", customers: top.severity === "P3" ? 1 : 3, area: "reliability" });
  }
  return { opened: recent.length, resolved: recent.filter((r) => r.status === "resolved").length, byType, proposals: proposals.sort((a, b) => b.severity - a.severity).slice(0, 5) };
}

export function parseIncident(eventId: string, p: unknown): IncidentRec | null {
  const o = (p && typeof p === "object" ? p : {}) as Partial<IncidentRec>;
  if (typeof o.incidentId !== "string" || typeof o.key !== "string") return null;
  return { eventId, incidentId: o.incidentId, key: o.key, type: o.type ?? "system", severity: o.severity ?? "P3", title: o.title ?? o.key, status: o.status ?? "open", detectedAt: o.detectedAt ?? new Date(0).toISOString(), lastSeenAt: o.lastSeenAt ?? o.detectedAt ?? new Date(0).toISOString(), signals: Array.isArray(o.signals) ? o.signals : [], containment: Array.isArray(o.containment) ? o.containment : [], resolvedAt: o.resolvedAt ?? null, rootCause: o.rootCause ?? null, correctiveAction: o.correctiveAction ?? null, recurrence: o.recurrence ?? 0, escalatedAt: o.escalatedAt ?? null };
}
/** Props to store in the AdsEvent (everything except eventId). */
export function incidentProps(r: IncidentRec): Record<string, unknown> { const { eventId: _e, ...rest } = r; void _e; return rest; }

export function escalationEmail(rec: IncidentRec, reason: string, adminUrl: string): { subject: string; text: string } {
  return {
    subject: `[${rec.severity}] ${rec.title}`,
    text: [`${reason}.`, "", rec.title, ...rec.signals.slice(-3).map((s) => `- ${s.detail}`), "", rec.containment.length ? `Already contained: ${rec.containment.map((c) => c.action).join(", ")}` : "Nothing was changed automatically.", `Details and runbook: ${adminUrl}/admin/ads/incidents`, `Runbook: docs/ops/incident-runbook.md (section for "${rec.type}").`].join("\n"),
  };
}

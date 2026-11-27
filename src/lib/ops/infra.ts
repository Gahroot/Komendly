// Infrastructure watch (pure evaluators). All checks are read-only; the engine job (engine/src/ops/infra.ts) does the I/O.
import type { Severity, Signal } from "./incidents";

export const OWNED_DOMAINS = ["komendly.com", "getkomendly.com"] as const;
export const DAY = 86_400_000;
export const daysUntil = (d: Date | null, now: Date): number | null => (d ? Math.floor((d.getTime() - now.getTime()) / DAY) : null);

export type ExpiryKind = "ssl" | "domain" | "meta_token" | "codex_login";
export interface ExpiryItem { name: string; kind: ExpiryKind; expiresAt: Date | null; action: string }
export interface ExpiryEval { name: string; kind: ExpiryKind; days: number | null; severity: Severity | null; action: string }

/** [P1 at <= x days, P2 at <= y days, listed (P3) at <= z days]. */
const THRESH: Record<ExpiryKind, [number, number, number]> = { ssl: [3, 14, 30], domain: [7, 30, 60], meta_token: [2, 7, 21], codex_login: [0, 3, 7] };

export function evalExpiry(i: ExpiryItem, now: Date): ExpiryEval {
  const days = daysUntil(i.expiresAt, now);
  let severity: Severity | null = null;
  if (days !== null) { const [p1, p2, p3] = THRESH[i.kind]; severity = days <= p1 ? "P1" : days <= p2 ? "P2" : days <= p3 ? "P3" : null; }
  return { name: i.name, kind: i.kind, days, severity, action: i.action };
}

export function expirySignals(evals: ExpiryEval[]): Signal[] {
  return evals.filter((e) => e.severity && e.severity !== "P3").map((e) => ({ key: `infra:expiry:${e.kind}:${e.name}`.slice(0, 120), type: "infra" as const, severity: e.severity as Severity, title: `${e.name} ${e.days !== null && e.days < 0 ? "has expired" : `expires in ${e.days} day(s)`}`, detail: e.action }));
}

/** The weekly owner list: everything expiring within 45 days (or already expired), soonest first. */
export function expiringSoon(evals: ExpiryEval[]): ExpiryEval[] {
  return evals.filter((e) => (e.kind === "codex_login" ? e.severity !== null : e.days !== null && e.days <= 45)).sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
}
export function weeklyExpiryEmail(list: ExpiryEval[]): { subject: string; text: string } | null {
  if (!list.length) return null;
  return { subject: `Komendly: ${list.length} thing(s) expiring soon`, text: ["Expiring within 45 days:", "", ...list.map((e) => `- ${e.name}: ${e.days! < 0 ? "EXPIRED" : `${e.days} day(s)`}. ${e.action}`), "", "Read-only report from the infra watch; nothing was changed."].join("\n") };
}

/** RDAP domain JSON -> expiration date (eventAction "expiration"), or null. */
export function parseRdapExpiry(json: unknown): Date | null {
  const ev = (json as { events?: { eventAction?: string; eventDate?: string }[] } | null)?.events;
  const e = Array.isArray(ev) ? ev.find((x) => x.eventAction === "expiration") : null;
  const d = e?.eventDate ? new Date(e.eventDate) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export interface HttpFact { name: string; url: string; status: number | null; ms: number | null; error?: string }
export function httpSignals(fs: HttpFact[]): Signal[] {
  return fs.filter((f) => f.error || f.status === null || f.status >= 500 || f.status === 0).map((f) => ({ key: `infra:http:${f.name}`, type: "infra" as const, severity: f.name === "site" ? "P1" as const : "P2" as const, title: `${f.name} health check failing`, detail: f.error ?? `HTTP ${f.status}` }));
}

export interface DbFact { connections: number; maxConnections: number; sizeBytes: number; slowQueries: number; waitingLocks: number }
export function dbSignals(d: DbFact, sizeWarnBytes: number): Signal[] {
  const out: Signal[] = [];
  const use = d.maxConnections > 0 ? d.connections / d.maxConnections : 0;
  if (use >= 0.85) out.push({ key: "infra:db:connections", type: "infra", severity: "P2", title: "Database connections near the limit", detail: `${d.connections}/${d.maxConnections} connections` });
  if (d.slowQueries >= 3) out.push({ key: "infra:db:slow", type: "infra", severity: "P3", title: "Several slow queries running", detail: `${d.slowQueries} active queries over 30s` });
  if (d.waitingLocks >= 3) out.push({ key: "infra:db:locks", type: "infra", severity: "P2", title: "Queries waiting on locks", detail: `${d.waitingLocks} waiting` });
  if (d.sizeBytes >= sizeWarnBytes) out.push({ key: "infra:db:size", type: "infra", severity: "P3", title: "Database size above the watch threshold", detail: `${(d.sizeBytes / 1e9).toFixed(1)} GB` });
  return out;
}

/** CodexCredential: the access token refreshes itself; a row not rewritten for a long time means refresh broke. */
export function codexLoginItem(row: { updatedAt: Date } | null, now: Date): ExpiryItem {
  // Treat "last refreshed" + 30 days as the soft expiry of the login (refresh tokens are long-lived but not forever).
  return { name: "Codex login (shared credential)", kind: "codex_login", expiresAt: row ? new Date(row.updatedAt.getTime() + 30 * DAY) : null, action: row ? "If no refresh happens, re-login Codex on the engine (see runbook: provider)." : "No CodexCredential row; engine uses env login." };
}

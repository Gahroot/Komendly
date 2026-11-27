// Weekly process-improvement analysis. Pure: feed it operations data, get ranked 'process_finding' candidates and outcome
// metrics. Success is measured by OUTCOMES (recurrence rate, owner interventions per week, mean time to detect / resolve),
// never by how many automations exist. No I/O, no AI.

export type Sev = "P1" | "P2" | "P3";
export interface IncidentRow { key: string; type: string; severity: Sev; detectedAt: string; resolvedAt: string | null; /** when the fault actually began, if known (for time-to-detect) */ startedAt?: string | null }
export interface InterventionRow { kind: string; note: string; at: string }
export interface CountRow { key: string; count: number }
export interface AnalysisInput {
  now: Date;
  windowDays?: number;
  incidents: IncidentRow[];
  interventions: InterventionRow[];
  /** Support topics (cluster label -> tickets in the window). */
  supportClusters?: CountRow[];
  /** Manual reruns / retried jobs by kind in the window. */
  reruns?: CountRow[];
  /** Job failures by kind in the window. */
  failures?: CountRow[];
}
export interface ProcessFinding {
  key: string;
  area: "incident" | "intervention" | "support" | "rerun" | "failure";
  title: string;
  recurrence: number;
  impact: number;
  score: number;
  evidence: string;
  proposedFix: string;
}
export interface Window { incidents: number; distinctKeys: number; repeatKeys: number; recurrenceRate: number; interventions: number; interventionsPerWeek: number; meanTimeToResolveMin: number | null; meanTimeToDetectMin: number | null }
export interface Analysis { current: Window; previous: Window; findings: ProcessFinding[]; verdict: "improving" | "flat" | "worse" | "insufficient_data" }

export const SEVERITY_IMPACT: Record<Sev, number> = { P1: 10, P2: 4, P3: 1 };
const DAY = 86_400_000;
const ts = (s: string) => Date.parse(s);
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Permanent-fix proposals; the first matching pattern wins. Phrased as causes to remove, not more monitoring. */
export const FIX_LIBRARY: Array<[RegExp, string]> = [
  [/^funnel:/, "Add the failing page/route to the pre-deploy smoke test (scripts/funnel-smoke.ts) so it is caught before release, not after."],
  [/heartbeat|engine|worker/, "Find why the worker stalls (memory, long job, provider hang) and add a timeout/restart at the cause; alerting alone does not fix it."],
  [/provider|codex/, "Add a fallback or queued retry for the provider so one login/limit failure stops being a manual fix."],
  [/deliverab|blocklist|kly/, "Tighten the kly governor/lead-quality rule that produced the reputation hit instead of hand-pausing domains."],
  [/webhook|payment|stripe/, "Make the handler idempotent and retry-safe, and add an invariant test for the failing event type."],
  [/support|reply/, "Turn the repeated question into a product fix or a self-serve answer in the app, then retire the manual reply."],
  [/rerun|retry/, "Fix the job's failure cause at its source; manual reruns mean the automatic retry rule is wrong."],
];
const fixFor = (key: string) => FIX_LIBRARY.find(([re]) => re.test(key))?.[1] ?? "Write a one-line root cause, then change the code/config that caused it so a person never has to do this by hand again.";

function windowStats(inc: IncidentRow[], iv: InterventionRow[], from: number, to: number): Window {
  const i = inc.filter((r) => ts(r.detectedAt) >= from && ts(r.detectedAt) < to);
  const keys = new Map<string, number>();
  for (const r of i) keys.set(r.key, (keys.get(r.key) ?? 0) + 1);
  const repeat = [...keys.values()].filter((n) => n > 1).length;
  const n = iv.filter((r) => ts(r.at) >= from && ts(r.at) < to).length;
  const weeks = (to - from) / (7 * DAY);
  return {
    incidents: i.length,
    distinctKeys: keys.size,
    repeatKeys: repeat,
    recurrenceRate: keys.size ? Math.round((repeat / keys.size) * 100) / 100 : 0,
    interventions: n,
    interventionsPerWeek: Math.round((n / weeks) * 10) / 10,
    meanTimeToResolveMin: mean(i.filter((r) => r.resolvedAt).map((r) => (ts(r.resolvedAt!) - ts(r.detectedAt)) / 60_000)),
    meanTimeToDetectMin: mean(i.filter((r) => r.startedAt).map((r) => Math.max(0, (ts(r.detectedAt) - ts(r.startedAt!)) / 60_000))),
  };
}

export function analyseProcess(inp: AnalysisInput): Analysis {
  const days = inp.windowDays ?? 28;
  const end = inp.now.getTime();
  const mid = end - days * DAY;
  const current = windowStats(inp.incidents, inp.interventions, mid, end + 1);
  const previous = windowStats(inp.incidents, inp.interventions, mid - days * DAY, mid);
  const findings: ProcessFinding[] = [];

  const byKey = new Map<string, IncidentRow[]>();
  for (const r of inp.incidents.filter((r) => ts(r.detectedAt) >= mid)) byKey.set(r.key, [...(byKey.get(r.key) ?? []), r]);
  for (const [key, rows] of byKey) {
    if (rows.length < 2) continue; // a one-off is an incident, not a process problem
    const impact = Math.max(...rows.map((r) => SEVERITY_IMPACT[r.severity]));
    findings.push({ key: `incident:${key}`, area: "incident", title: `Recurring incident: ${key}`, recurrence: rows.length, impact, score: rows.length * impact, evidence: `${rows.length} incidents in ${days}d, worst ${rows.map((r) => r.severity).sort()[0]}`, proposedFix: fixFor(key) });
  }
  const iv = new Map<string, InterventionRow[]>();
  for (const r of inp.interventions.filter((r) => ts(r.at) >= mid)) iv.set(r.kind, [...(iv.get(r.kind) ?? []), r]);
  for (const [kind, rows] of iv) {
    if (rows.length < 2) continue;
    findings.push({ key: `intervention:${kind}`, area: "intervention", title: `Owner keeps doing this by hand: ${kind}`, recurrence: rows.length, impact: 5, score: rows.length * 5, evidence: `${rows.length} manual interventions in ${days}d; latest note: ${rows[rows.length - 1]?.note.slice(0, 120) ?? ""}`, proposedFix: fixFor(kind) });
  }
  const counted = (rows: CountRow[] | undefined, area: ProcessFinding["area"], impact: number, label: string) => {
    for (const r of rows ?? []) if (r.count >= 2) findings.push({ key: `${area}:${r.key}`, area, title: `${label}: ${r.key}`, recurrence: r.count, impact, score: r.count * impact, evidence: `${r.count} in ${days}d`, proposedFix: fixFor(`${area} ${r.key}`) });
  };
  counted(inp.supportClusters, "support", 3, "Repeated support question");
  counted(inp.reruns, "rerun", 3, "Manual reruns");
  counted(inp.failures, "failure", 4, "Repeated job failure");

  findings.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  let verdict: Analysis["verdict"] = "insufficient_data";
  if (previous.incidents + previous.interventions > 0) {
    const worse = [current.recurrenceRate > previous.recurrenceRate, current.interventionsPerWeek > previous.interventionsPerWeek, (current.meanTimeToResolveMin ?? 0) > (previous.meanTimeToResolveMin ?? 0)].filter(Boolean).length;
    const better = [current.recurrenceRate < previous.recurrenceRate, current.interventionsPerWeek < previous.interventionsPerWeek, (current.meanTimeToResolveMin ?? 0) < (previous.meanTimeToResolveMin ?? 0)].filter(Boolean).length;
    verdict = better > worse ? "improving" : worse > better ? "worse" : "flat";
  }
  return { current, previous, findings, verdict };
}

export const PROCESS_FINDING_EVENT = "process_finding";

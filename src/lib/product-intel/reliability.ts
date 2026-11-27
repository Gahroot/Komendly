// Reliability intelligence (growth system `reliability`, flag sys_reliability, default OFF). Pure analyzers over AdJob / AdRun / Ad rows:
// failure rate by stage/provider/model/template, time-to-first-ad / time-to-pack percentiles, retries, stuck jobs, partial packs,
// provider outage detection (read-only provider-order guidance), per-workspace blast radius, and the SLO check.
// Pure TS (the engine imports it): no Next, Prisma or Node-only imports. The loader at the bottom takes a structural db.

export const RELIABILITY_EVENT = "reliability_snapshot";
export const FINDING_EVENT = "reliability_finding";

/** SLO: SLO_TARGET of finished standard packs have >= PACK_MIN_ADS ready ads within PACK_WITHIN_MS of confirm. Bounds let the product loop tune within reason. */
export const SLO_DEFAULTS = { target: 0.97, packMinAds: 8, packWithinMs: 10 * 60_000, minSample: 10 };
export const SLO_BOUNDS = { target: [0.9, 0.995], packWithinMs: [5 * 60_000, 20 * 60_000] } as const;
export type SloConfig = typeof SLO_DEFAULTS;

export interface JobRow {
  id: string; type: string; runId: string | null; workspaceId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "dead" | "canceled";
  attempts: number; maxAttempts: number;
  lockedAt: Date | null; runAt?: Date | null; createdAt: Date; finishedAt: Date | null; durationMs: number | null;
  costMicros: number; lastError: string | null;
  /** payload/result are read tolerantly for provider/model/template: absent = "unknown". */
  payload?: unknown; result?: unknown;
}
export interface RunRow {
  id: string; workspaceId: string; status: string; isTrial: boolean; kind: string; staticCount: number;
  createdAt: Date; confirmedAt: Date | null; firstAdAt: Date | null; completedAt: Date | null; costMicros: number; creditsCharged: number;
}
export interface AdRow { runId: string; workspaceId: string; kind: "static" | "motion"; status: string; template: string | null; costMicros: number }
export interface ReliabilityInput { now: Date; windowDays: number; jobs: JobRow[]; runs: RunRow[]; ads: AdRow[] }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function jobProvider(j: Pick<JobRow, "payload" | "result">): string {
  const r = obj(j.result), p = obj(j.payload);
  return str(r.provider) ?? str(p.provider) ?? str(obj(r.render).provider) ?? "unknown";
}
export function jobModel(j: Pick<JobRow, "payload" | "result">): string {
  const r = obj(j.result), p = obj(j.payload);
  return str(r.model) ?? str(p.model) ?? str(obj(r.render).model) ?? "unknown";
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] ?? null;
}
export const pcts = (v: number[]) => ({ n: v.length, p50: percentile(v, 50), p90: percentile(v, 90), p99: percentile(v, 99) });

export interface RateRow { key: string; n: number; failed: number; rate: number }
const isFail = (j: JobRow) => j.status === "dead" || j.status === "failed";
const isDone = (j: JobRow) => j.status === "succeeded" || j.status === "dead" || j.status === "failed";

/** Failure rate (dead/failed attempts over finished jobs) grouped by any key; sorted worst first, min 1 finished job. */
export function failureRates(jobs: JobRow[], keyOf: (j: JobRow) => string): RateRow[] {
  const m = new Map<string, { n: number; failed: number }>();
  for (const j of jobs) {
    if (!isDone(j)) continue;
    const k = keyOf(j), e = m.get(k) ?? { n: 0, failed: 0 };
    e.n++; if (isFail(j)) e.failed++;
    m.set(k, e);
  }
  return [...m].map(([key, e]) => ({ key, ...e, rate: e.n ? e.failed / e.n : 0 })).sort((a, b) => b.rate - a.rate || b.n - a.n);
}

export function templateFailureRates(ads: AdRow[]): RateRow[] {
  const m = new Map<string, { n: number; failed: number }>();
  for (const a of ads) {
    if (a.status !== "ready" && a.status !== "failed" && a.status !== "failed_qc") continue;
    const k = a.template ?? "unknown", e = m.get(k) ?? { n: 0, failed: 0 };
    e.n++; if (a.status !== "ready") e.failed++;
    m.set(k, e);
  }
  return [...m].map(([key, e]) => ({ key, ...e, rate: e.n ? e.failed / e.n : 0 })).sort((a, b) => b.rate - a.rate || b.n - a.n);
}

export const STUCK = { runningMs: 20 * 60_000, queuedMs: 15 * 60_000 } as const;
/** Zombies: `running` past the lock window (engine died mid-job); stuck: `queued` long past runAt. */
export function stuckJobs(jobs: JobRow[], now: Date): { zombies: JobRow[]; stuckQueued: JobRow[] } {
  const t = now.getTime();
  return {
    zombies: jobs.filter((j) => j.status === "running" && j.lockedAt && t - j.lockedAt.getTime() > STUCK.runningMs),
    stuckQueued: jobs.filter((j) => j.status === "queued" && t - (j.runAt ?? j.createdAt).getTime() > STUCK.queuedMs),
  };
}

export function retryStats(jobs: JobRow[]) {
  const retried = jobs.filter((j) => j.attempts > 1);
  const extraAttempts = retried.reduce((a, j) => a + (j.attempts - 1), 0);
  const byType = new Map<string, number>();
  for (const j of retried) byType.set(j.type, (byType.get(j.type) ?? 0) + (j.attempts - 1));
  return { jobs: jobs.length, retriedJobs: retried.length, extraAttempts, retryRate: jobs.length ? retried.length / jobs.length : 0, byType: Object.fromEntries(byType) };
}

export interface Provide { provider: string; n: number; failed: number; rate: number }
export interface Outage { provider: string; recentN: number; recentRate: number; baselineRate: number; guidance: string }
/** Outage = in the last `recentMin` minutes >= 5 finished jobs and >= 50% failed while the earlier baseline was < 30%. Guidance is a recommendation only. */
export function detectOutages(jobs: JobRow[], now: Date, recentMin = 60): Outage[] {
  const cut = now.getTime() - recentMin * 60_000;
  const when = (j: JobRow) => (j.finishedAt ?? j.createdAt).getTime();
  const by = new Map<string, { rn: number; rf: number; bn: number; bf: number }>();
  for (const j of jobs) {
    if (!isDone(j)) continue;
    const k = jobProvider(j), e = by.get(k) ?? { rn: 0, rf: 0, bn: 0, bf: 0 };
    if (when(j) >= cut) { e.rn++; if (isFail(j)) e.rf++; } else { e.bn++; if (isFail(j)) e.bf++; }
    by.set(k, e);
  }
  const out: Outage[] = [];
  for (const [provider, e] of by) {
    if (provider === "unknown") continue;
    const recentRate = e.rn ? e.rf / e.rn : 0, baselineRate = e.bn ? e.bf / e.bn : 0;
    if (e.rn >= 5 && recentRate >= 0.5 && baselineRate < 0.3)
      out.push({ provider, recentN: e.rn, recentRate, baselineRate, guidance: `Provider "${provider}" failed ${Math.round(recentRate * 100)}% of ${e.rn} jobs in the last ${recentMin} min (baseline ${Math.round(baselineRate * 100)}%). Recommended: move it last in the provider order (e.g. fall back to the next provider) until it recovers. Read-only: nothing was changed.` });
  }
  return out;
}

export interface BlastRadius { activeJobs: number; topWorkspace: string | null; topShare: number; flagged: boolean }
/** One workspace holding > 50% of >= 6 active (queued+running) jobs can starve others. Reports; never throttles. */
export function blastRadius(jobs: JobRow[]): BlastRadius {
  const active = jobs.filter((j) => j.status === "queued" || j.status === "running");
  const by = new Map<string, number>();
  for (const j of active) if (j.workspaceId) by.set(j.workspaceId, (by.get(j.workspaceId) ?? 0) + 1);
  const top = [...by].sort((a, b) => b[1] - a[1])[0];
  const share = top && active.length ? top[1] / active.length : 0;
  return { activeJobs: active.length, topWorkspace: top?.[0] ?? null, topShare: share, flagged: active.length >= 6 && by.size > 1 && share > 0.5 };
}

export interface SloResult { sample: number; ok: number; rate: number | null; target: number; breached: boolean; insufficient: boolean; failedRuns: number; slowRuns: number; shortRuns: number }
/** Standard packs (not gift) that asked for >= packMinAds statics and reached a final status. */
export function evaluateSlo(runs: RunRow[], ads: AdRow[], cfg: SloConfig = SLO_DEFAULTS): SloResult {
  const ready = new Map<string, number>();
  for (const a of ads) if (a.status === "ready") ready.set(a.runId, (ready.get(a.runId) ?? 0) + 1);
  const eligible = runs.filter((r) => r.kind === "standard" && r.confirmedAt && r.staticCount >= cfg.packMinAds && ["completed", "partial", "failed"].includes(r.status));
  let ok = 0, failedRuns = 0, slowRuns = 0, shortRuns = 0;
  for (const r of eligible) {
    const ms = r.completedAt && r.confirmedAt ? r.completedAt.getTime() - r.confirmedAt.getTime() : null;
    const n = ready.get(r.id) ?? 0;
    const fast = ms !== null && ms <= cfg.packWithinMs;
    if (r.status === "failed") failedRuns++;
    else if (n < cfg.packMinAds) shortRuns++;
    else if (!fast) slowRuns++;
    if (r.status !== "failed" && n >= cfg.packMinAds && fast) ok++;
  }
  const sample = eligible.length, rate = sample ? ok / sample : null;
  const insufficient = sample < cfg.minSample;
  return { sample, ok, rate, target: cfg.target, insufficient, breached: !insufficient && rate !== null && rate < cfg.target, failedRuns, slowRuns, shortRuns };
}

export interface Finding { key: string; kind: "outage" | "stuck" | "blast_radius" | "slo_breach" | "hotspot" | "partial_packs"; severity: 1 | 2 | 3; title: string; detail: string }
export interface ReliabilitySnapshot {
  day: string; windowDays: number; slo: SloResult;
  timeToFirstAdMs: ReturnType<typeof pcts>; timeToPackMs: ReturnType<typeof pcts>;
  failureByStage: RateRow[]; failureByProvider: RateRow[]; failureByModel: RateRow[]; failureByTemplate: RateRow[];
  retries: ReturnType<typeof retryStats>; zombies: number; stuckQueued: number;
  partialPacks: { n: number; of: number; rate: number }; outages: Outage[]; blast: BlastRadius; findings: Finding[];
}

export function buildReliabilitySnapshot(input: ReliabilityInput, cfg: SloConfig = SLO_DEFAULTS): ReliabilitySnapshot {
  const { now, jobs, runs, ads } = input;
  const finished = runs.filter((r) => r.kind === "standard" && r.confirmedAt);
  const ttf = finished.flatMap((r) => (r.firstAdAt && r.confirmedAt ? [r.firstAdAt.getTime() - r.confirmedAt.getTime()] : [])).filter((x) => x >= 0);
  const ttp = finished.flatMap((r) => (r.completedAt && r.confirmedAt && r.status !== "failed" ? [r.completedAt.getTime() - r.confirmedAt.getTime()] : [])).filter((x) => x >= 0);
  const slo = evaluateSlo(runs, ads, cfg), stuck = stuckJobs(jobs, now), outages = detectOutages(jobs, now), blast = blastRadius(jobs);
  const done = runs.filter((r) => ["completed", "partial", "failed"].includes(r.status) && r.kind === "standard");
  const partial = done.filter((r) => r.status === "partial").length;
  const failureByStage = failureRates(jobs, (j) => j.type), failureByTemplate = templateFailureRates(ads);
  const findings: Finding[] = [];
  for (const o of outages) findings.push({ key: `outage:${o.provider}`, kind: "outage", severity: 3, title: `Provider outage suspected: ${o.provider}`, detail: o.guidance });
  if (stuck.zombies.length) findings.push({ key: "stuck:zombie", kind: "stuck", severity: 2, title: `${stuck.zombies.length} zombie job(s) (running > ${STUCK.runningMs / 60000} min)`, detail: `Types: ${[...new Set(stuck.zombies.map((j) => j.type))].join(", ")}. The engine reclaims locks on restart; if it persists the worker is wedged.` });
  if (stuck.stuckQueued.length >= 3) findings.push({ key: "stuck:queued", kind: "stuck", severity: 2, title: `${stuck.stuckQueued.length} jobs queued > ${STUCK.queuedMs / 60000} min`, detail: "Queue is not draining: check engine heartbeat / concurrency." });
  if (blast.flagged) findings.push({ key: `blast:${blast.topWorkspace}`, kind: "blast_radius", severity: 1, title: `One workspace holds ${Math.round(blast.topShare * 100)}% of active jobs`, detail: `Workspace ${blast.topWorkspace} has most of ${blast.activeJobs} active jobs; other customers may wait. Consider a per-workspace concurrency cap (proposal only).` });
  if (slo.breached) findings.push({ key: "slo:pack", kind: "slo_breach", severity: 3, title: `Pack SLO breached: ${(100 * (slo.rate ?? 0)).toFixed(1)}% < ${(slo.target * 100).toFixed(0)}%`, detail: `${slo.ok}/${slo.sample} packs had >=${cfg.packMinAds} ads within ${Math.round(cfg.packWithinMs / 60000)} min (failed ${slo.failedRuns}, too few ads ${slo.shortRuns}, too slow ${slo.slowRuns}).` });
  const worst = failureByStage.find((r) => r.n >= 10 && r.rate >= 0.15);
  if (worst) findings.push({ key: `hotspot:${worst.key}`, kind: "hotspot", severity: 2, title: `Stage "${worst.key}" fails ${Math.round(worst.rate * 100)}% (${worst.failed}/${worst.n})`, detail: "Highest failure rate among stages with >= 10 finished jobs." });
  if (done.length >= 10 && partial / done.length >= 0.2) findings.push({ key: "partial_packs", kind: "partial_packs", severity: 2, title: `${Math.round((partial / done.length) * 100)}% of packs finish partial`, detail: `${partial}/${done.length} packs: some ads failed QC/generation.` });
  return {
    day: now.toISOString().slice(0, 10), windowDays: input.windowDays, slo, timeToFirstAdMs: pcts(ttf), timeToPackMs: pcts(ttp),
    failureByStage, failureByProvider: failureRates(jobs, jobProvider), failureByModel: failureRates(jobs, jobModel), failureByTemplate,
    retries: retryStats(jobs), zombies: stuck.zombies.length, stuckQueued: stuck.stuckQueued.length,
    partialPacks: { n: partial, of: done.length, rate: done.length ? partial / done.length : 0 }, outages, blast, findings,
  };
}

/** Clamp a proposed SLO threshold into SLO_BOUNDS (used by the product loop's allow-listed threshold changes). */
export function clampSlo(cfg: Partial<SloConfig>): SloConfig {
  const c = (v: number | undefined, d: number, [lo, hi]: readonly [number, number]) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return { ...SLO_DEFAULTS, target: c(cfg.target, SLO_DEFAULTS.target, SLO_BOUNDS.target), packWithinMs: c(cfg.packWithinMs, SLO_DEFAULTS.packWithinMs, SLO_BOUNDS.packWithinMs) };
}

type Rows = Array<Record<string, unknown>>;
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ReliabilityDb {
  adJob: { findMany(a: any): Promise<Rows> };
  adRun: { findMany(a: any): Promise<Rows> };
  ad: { findMany(a: any): Promise<Rows> };
}
const d = (v: unknown) => (v instanceof Date ? v : null);
const n = (v: unknown) => (typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : 0);

export async function loadReliabilityInput(db: ReliabilityDb, now: Date, windowDays = 7): Promise<ReliabilityInput> {
  const since = new Date(now.getTime() - windowDays * 86_400_000);
  const [jobs, runs, ads] = await Promise.all([
    db.adJob.findMany({ where: { OR: [{ createdAt: { gte: since } }, { status: { in: ["queued", "running"] } }] }, take: 20000, orderBy: { createdAt: "desc" },
      select: { id: true, type: true, runId: true, workspaceId: true, status: true, attempts: true, maxAttempts: true, lockedAt: true, runAt: true, createdAt: true, finishedAt: true, durationMs: true, costMicros: true, lastError: true } }),
    db.adRun.findMany({ where: { createdAt: { gte: since } }, take: 5000, orderBy: { createdAt: "desc" },
      select: { id: true, workspaceId: true, status: true, isTrial: true, kind: true, staticCount: true, createdAt: true, confirmedAt: true, firstAdAt: true, completedAt: true, costMicros: true, creditsCharged: true } }),
    db.ad.findMany({ where: { createdAt: { gte: since } }, take: 60000, select: { runId: true, workspaceId: true, kind: true, status: true, costMicros: true, visualBrief: true } }),
  ]);
  return {
    now, windowDays,
    jobs: jobs.map((j) => ({ ...(j as object), lockedAt: d(j.lockedAt), runAt: d(j.runAt), createdAt: d(j.createdAt) ?? now, finishedAt: d(j.finishedAt), costMicros: n(j.costMicros), durationMs: typeof j.durationMs === "number" ? j.durationMs : null, lastError: str(j.lastError) } as JobRow)),
    runs: runs.map((r) => ({ ...(r as object), createdAt: d(r.createdAt) ?? now, confirmedAt: d(r.confirmedAt), firstAdAt: d(r.firstAdAt), completedAt: d(r.completedAt), costMicros: n(r.costMicros), creditsCharged: n(r.creditsCharged) } as RunRow)),
    ads: ads.map((a) => ({ runId: String(a.runId), workspaceId: String(a.workspaceId), kind: a.kind === "motion" ? "motion" : "static", status: String(a.status), costMicros: n(a.costMicros), template: str(obj(obj(a.visualBrief).render).template) })),
  };
}

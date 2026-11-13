// Worker runner: polls the AdJob queue, dispatches by type with bounded concurrency,
// heartbeats, periodic ticks (stale locks, confirm sweeper, cleanup), graceful shutdown.
import { Limiter } from "./providers/limiter";
import type { Browser } from "playwright";
import type { EngineConfig } from "./config";
import type { Db } from "./db";
import { errMsg, log } from "./log";
import { ProviderUnavailableError } from "./providers/errors";
import type { AIProvider, UsageMeter } from "./providers/types";
import { JobAbortedError } from "./jobs/abort";
import { cappedTypes, DEFAULT_FAIRNESS, overCap, startLaneLimits } from "./queue/fairness";
import { claimJobs, completeJob, enqueueOnce, failJob, recoverOrphanedJobs, recoverStaleJobs, releaseJob, renewLeases, type ClaimedJob } from "./queue/queue";
import type { Storage } from "./storage/s3";
import { cleanupJob } from "./jobs/cleanup";
import { sweepConfirmations } from "./jobs/confirm-sweeper";
import { PermanentJobError, type JobHandler, type SharedResources } from "./jobs/context";
import { abandonReplacement, requestReplacement } from "./jobs/replace";
import { extractJob } from "./jobs/extract/index";
import { failRun, maybeFinalizeRun, syncRunCost } from "./jobs/finalize";
import { planJob } from "./jobs/plan";
import { handlePublishMeta } from "./jobs/publish-meta";
import { qcJob } from "./jobs/qc";
import { renderJob } from "./jobs/render";
import { bonusJob, onBonusTerminal } from "./jobs/bonus";
import { bonusGenerateJob } from "./bonuses/job";
import { BONUS_JOB_TYPE } from "../../src/lib/ads/bonuses/contracts";
import { sleep } from "./util/sleep";
import { TESTIMONIAL_JOB_TYPE, TESTIMONIAL_RECOMMEND_JOB_TYPE } from "../../src/lib/testimonial/contracts";
import { onTestimonialDeadDb, recommendActorsJob, sweepDeadTestimonials, testimonialJob } from "./testimonial/job";
import { STUDIO_PROBE_JOB_TYPE, STUDIO_TURN_JOB_TYPE } from "../../src/lib/studio/contracts";
import { createStudioTurnHandler, studioProbeJob } from "./studio/index";
import { COACH_JOB_TYPE } from "../../src/lib/ads/coach/contracts";
import { coachReviewJob, onCoachDead } from "./coach/job";

export const HANDLERS: Record<string, JobHandler> = {
  extract: (c) => extractJob(c),
  plan: planJob,
  render_static: renderJob,
  render_motion: renderJob,
  qc: qcJob,
  bonus: bonusJob,
  [BONUS_JOB_TYPE]: bonusGenerateJob,
  cleanup: cleanupJob,
  publish_meta: (c) => handlePublishMeta(c),
  [TESTIMONIAL_JOB_TYPE]: testimonialJob,
  [TESTIMONIAL_RECOMMEND_JOB_TYPE]: recommendActorsJob,
  [STUDIO_TURN_JOB_TYPE]: createStudioTurnHandler(),
  [STUDIO_PROBE_JOB_TYPE]: studioProbeJob,
  [COACH_JOB_TYPE]: coachReviewJob,
};
/** Job types that need the AI provider. */
export const AI_TYPES = ["extract", "plan", "render_static", "render_motion", "qc", "bonus", BONUS_JOB_TYPE, STUDIO_TURN_JOB_TYPE, COACH_JOB_TYPE];
// Testimonial jobs degrade to the free template without Codex, so they never wait on provider health.
export const NON_AI_TYPES = ["cleanup", "publish_meta", TESTIMONIAL_JOB_TYPE, TESTIMONIAL_RECOMMEND_JOB_TYPE, STUDIO_PROBE_JOB_TYPE];
const START_TYPES = new Set(DEFAULT_FAIRNESS.start);

export interface RunnerDeps {
  db: Db;
  storage: Storage;
  provider: AIProvider;
  config: EngineConfig;
  launchBrowser: () => Promise<Browser>;
  /** Only process jobs of this run (scripts that share the dev DB with other workers). */
  scopeRunId?: string;
}

export function isTransient(e: unknown): boolean {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message, (cur as { code?: string }).code ?? "");
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|UND_ERR|other side closed|network|5\d\d Service|SlowDown|InternalError/i.test(parts.join(" "));
}

/** The box ran out of processes/memory/Chrome slots (overload): wait and retry, it is not the job's fault. */
export function isResourceExhaustion(e: unknown): boolean {
  const m = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ""}` : String(e);
  return /Resource temporarily unavailable|pthread_create|EAGAIN|ENOMEM|EMFILE|Cannot allocate memory|Chrome could not (start|launch)|Failed to launch the browser|browser\.newPage: Target page, context or browser has been closed|spawn .* (EAGAIN|ENOMEM)/i.test(m);
}

/** Wall-clock limit per job type (env ENGINE_JOB_TIMEOUT_MS_<TYPE> overrides). Motion renders normally take 12-16 min. */
export function jobTimeoutMs(type: string, env: NodeJS.ProcessEnv = process.env): number {
  const own = Number(env[`ENGINE_JOB_TIMEOUT_MS_${type.toUpperCase()}`]);
  if (own > 0) return own;
  const defaults: Record<string, number> = { render_motion: 45 * 60_000, studio_turn: 40 * 60_000, extract: 15 * 60_000 };
  return defaults[type] ?? 30 * 60_000;
}

export class JobTimeoutError extends Error {
  constructor(type: string, ms: number) {
    super(`${type} took longer than ${Math.round(ms / 60_000)} min and was stopped`);
  }
}

export function isBrowserCrash(e: unknown): boolean {
  return /Target crashed|Target closed|Browser has been closed|browser has disconnected|Page crashed/i.test(e instanceof Error ? e.message : String(e));
}

export class Runner {
  private stopping = false;
  private readonly abort = new AbortController();
  private readonly active = new Map<string, Promise<void>>();
  private readonly activeTypes = new Map<string, string>();
  private providerOk = false;
  private providerMsg: string | undefined;
  private browser: Promise<Browser> | null = null;
  private readonly timers: NodeJS.Timeout[] = [];
  private stats = { done: 0, failed: 0 };
  private readonly shared: SharedResources;
  private readonly pages = new Limiter({ maxConcurrent: Math.max(1, Number(process.env.ENGINE_MAX_PAGES) || 6), maxPerWindow: 10_000, windowMs: 60_000 });

  constructor(private readonly d: RunnerDeps) {
    this.shared = {
      renderBrowser: () => {
        this.browser ??= d.launchBrowser().then((b) => {
          b.on("disconnected", () => {
            this.browser = null;
          });
          return b;
        });
        return this.browser;
      },
      withRenderBrowser: async (fn, signal) =>
        this.pages.run(async () => {
          try {
            return await fn(await this.shared.renderBrowser());
          } catch (e) {
            if (!isBrowserCrash(e)) throw e;
            const old = this.browser;
            this.browser = null;
            await old?.then((b) => b.close()).catch(() => undefined);
            return fn(await this.shared.renderBrowser());
          }
        }, signal),
    };
  }

  get providerHealthy(): boolean {
    return this.providerOk;
  }

  async start(): Promise<void> {
    await this.heartbeat();
    const every = (ms: number, fn: () => Promise<unknown>, name: string) => {
      const t = setInterval(() => {
        if (!this.stopping) fn().catch((e) => log("warn", `${name} tick failed`, { error: errMsg(e) }));
      }, ms);
      this.timers.push(t);
    };
    every(this.d.config.heartbeatMs, () => this.heartbeat(), "heartbeat");
    // Keep the leases of running jobs fresh so stale recovery never steals a healthy long render.
    every(this.d.config.leaseRenewMs, () => renewLeases(this.d.db, this.d.config.workerId, [...this.active.keys()]), "lease");
    every(60_000, () => recoverStaleJobs(this.d.db, this.d.config.staleLockMs).then((n) => n && log("warn", "recovered stale jobs", { n })), "stale");
    every(60_000, () => sweepDeadTestimonials(this.d.db).then((n) => n && log("warn", "released minutes of dead testimonial jobs", { n })), "testimonial-sweep");
    every(2_000, () => sweepConfirmations(this.d.db).then((r) => (r.confirmed || r.planned) && log("info", "confirm sweep", r)), "sweeper");
    if (!this.d.scopeRunId) every(this.d.config.cleanupEveryMs, () => this.scheduleCleanup(), "cleanup");
    await recoverStaleJobs(this.d.db, this.d.config.staleLockMs);
    // Jobs of a dead worker (e.g. the container this deploy replaced): retry now, not after the stale window.
    const orphanDeadMs = Math.max(3 * this.d.config.heartbeatMs, 90_000);
    if (!this.d.scopeRunId) {
      const n = await recoverOrphanedJobs(this.d.db, this.d.config.workerId, orphanDeadMs).catch(() => 0);
      if (n) log("warn", "recovered orphaned jobs", { n });
      every(60_000, () => recoverOrphanedJobs(this.d.db, this.d.config.workerId, orphanDeadMs).then((n) => n && log("warn", "recovered orphaned jobs", { n })), "orphans");
    }
    if (!this.d.scopeRunId) await this.scheduleCleanup();
    void this.loop();
  }

  private async scheduleCleanup(): Promise<void> {
    await enqueueOnce(this.d.db, { type: "cleanup", priority: -10, maxAttempts: 2 });
  }

  async heartbeat(): Promise<void> {
    const h = await this.d.provider.health().catch((e: unknown) => ({ ok: false, message: errMsg(e) }));
    if (h.ok !== this.providerOk) log(h.ok ? "info" : "warn", "provider health", { provider: this.d.provider.name, ...h });
    this.providerOk = h.ok;
    this.providerMsg = h.message;
    const { db, config } = this.d;
    const pid = `provider:${this.d.provider.name}`;
    await db.engineHeartbeat.upsert({
      where: { id: pid },
      create: { id: pid, kind: "provider", ok: h.ok, message: h.message ?? null },
      update: { ok: h.ok, message: h.message ?? null },
    });
    const meta = { active: this.active.size, concurrency: config.concurrency, ...this.stats, provider: this.d.provider.name, stopping: this.stopping };
    await db.engineHeartbeat.upsert({
      where: { id: config.workerId },
      create: { id: config.workerId, kind: "worker", ok: true, message: null, meta },
      update: { ok: !this.stopping, meta },
    });
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      const free = this.d.config.concurrency - this.active.size;
      let claimed: ClaimedJob[] = [];
      if (free > 0) {
        const caps = { render_motion: Math.max(1, this.d.config.maxMotion ?? 3) };
        const activeList = [...this.activeTypes.values()];
        const types = cappedTypes(this.providerOk ? [...AI_TYPES, ...NON_AI_TYPES] : NON_AI_TYPES, activeList, caps);
        // Lane split: reserved slots are kept for start work (extract/plan) so a new run never
        // waits for long renders to finish.
        const activeStart = [...this.activeTypes.values()].filter((t) => START_TYPES.has(t)).length;
        const lim = startLaneLimits(this.d.config.concurrency, this.d.config.startLaneSlots, activeStart, this.active.size - activeStart);
        try {
          const startTypes = types.filter((t) => START_TYPES.has(t));
          // General slots take any work in fairness order (start work first); reserved-only slots take start work.
          const rest0 = lim.other > 0 ? await claimJobs(this.d.db, this.d.config.workerId, types, lim.other, DEFAULT_FAIRNESS, this.d.scopeRunId ?? null) : [];
          const reservedFree = lim.start - rest0.length;
          const first = reservedFree > 0 && startTypes.length ? await claimJobs(this.d.db, this.d.config.workerId, startTypes, reservedFree, DEFAULT_FAIRNESS, this.d.scopeRunId ?? null) : [];
          claimed = [...rest0, ...first];
          // A batch can overshoot a per-type cap: hand the extras straight back (no attempt spent).
          const extra = overCap(claimed, activeList, caps);
          if (extra.length) {
            for (const j of extra) await releaseJob(this.d.db, j.id, 0);
            const back = new Set(extra.map((j) => j.id));
            claimed = claimed.filter((j) => !back.has(j.id));
          }
          if (claimed.length) {
            const byType: Record<string, number> = {};
            for (const j of claimed) byType[j.type] = (byType[j.type] ?? 0) + 1;
            log("info", "claim", { n: claimed.length, byType, slotsBefore: this.active.size, slotsAfter: this.active.size + claimed.length, concurrency: this.d.config.concurrency, startLane: lim.start, otherLane: lim.other });
          }
        } catch (e) {
          log("error", "claim failed", { error: errMsg(e) });
        }
      }
      for (const j of claimed) {
        const p = this.execute(j).finally(() => {
          this.active.delete(j.id);
          this.activeTypes.delete(j.id);
        });
        this.active.set(j.id, p);
        this.activeTypes.set(j.id, j.type);
      }
      if (claimed.length === 0 || this.active.size >= this.d.config.concurrency) {
        await Promise.race([sleep(this.d.config.pollMs).catch(() => undefined), ...this.active.values()]);
      }
    }
  }

  private async execute(job: ClaimedJob): Promise<void> {
    const handler = HANDLERS[job.type];
    const usage: UsageMeter[] = [];
    const started = Date.now();
    const cost = () => usage.reduce((a, u) => a + u.costMicros, 0);
    log("info", "job start", { id: job.id, type: job.type, attempt: job.attempts, runId: job.runId, adId: job.adId });
    const jobAbort = new AbortController();
    try {
      if (!handler) throw new PermanentJobError(`no handler for job type ${job.type}`);
      // Hard per-job wall clock: a hung render (e.g. a Chrome grandchild holding the pipes open) used to keep its
      // lease renewed forever and block a motion slot. Past the limit the job is aborted and, if the handler still
      // doesn't return, abandoned as a failure so the slot frees up.
      const limitMs = jobTimeoutMs(job.type);
      const timer = setTimeout(() => jobAbort.abort(new JobTimeoutError(job.type, limitMs)), limitMs);
      const onStop = () => jobAbort.abort(this.abort.signal.reason);
      this.abort.signal.addEventListener("abort", onStop, { once: true });
      let hardTimer: NodeJS.Timeout | undefined;
      const hard = new Promise<never>((_, reject) => {
        jobAbort.signal.addEventListener("abort", () => {
          if (this.abort.signal.aborted) return;
          hardTimer = setTimeout(() => reject(new JobTimeoutError(job.type, limitMs)), 60_000);
        }, { once: true });
      });
      const result = await Promise.race([handler({
        db: this.d.db,
        storage: this.d.storage,
        provider: this.d.provider,
        config: this.d.config,
        job,
        signal: jobAbort.signal,
        usage,
        now: () => new Date(),
        shared: this.shared,
      }), hard]).finally(() => {
        clearTimeout(timer);
        if (hardTimer) clearTimeout(hardTimer);
        this.abort.signal.removeEventListener("abort", onStop);
      });
      await completeJob(this.d.db, job.id, { result, durationMs: Date.now() - started, costMicros: cost() });
      if (job.runId) await syncRunCost(this.d.db, job.runId).catch(() => undefined);
      this.stats.done++;
      log("info", "job done", { id: job.id, type: job.type, ms: Date.now() - started, costMicros: cost() });
    } catch (caught) {
      // A job stopped by its wall-clock limit is a real failure (spends an attempt), whatever the handler threw.
      const timedOut = jobAbort.signal.reason instanceof JobTimeoutError ? jobAbort.signal.reason : null;
      const e: unknown = timedOut ?? caught;
      const msg = errMsg(e);
      if (timedOut) log("error", "job timed out", { id: job.id, type: job.type });
      if (e instanceof ProviderUnavailableError || e instanceof JobAbortedError || (this.stopping && this.abort.signal.aborted)) {
        if (e instanceof ProviderUnavailableError) {
          this.providerOk = false;
          this.providerMsg = msg;
        }
        await releaseJob(this.d.db, job.id, e instanceof ProviderUnavailableError ? e.retryAfterMs : 0, msg).catch(() => undefined);
        log("warn", "job released", { id: job.id, type: job.type, reason: msg });
        return;
      }
      // Transient network errors (provider/bucket "fetch failed", resets): retry soon without
      // spending an attempt or counting as a QC/render failure, up to 5 times per job.
      const transient = Number(job.payload.transientRetries ?? 0);
      if (isTransient(e) && transient < 5) {
        await this.d.db.adJob
          .update({ where: { id: job.id }, data: { payload: { ...job.payload, transientRetries: transient + 1 } as object } })
          .catch(() => undefined);
        await releaseJob(this.d.db, job.id, 5_000 * 2 ** transient, `transient: ${msg}`).catch(() => undefined);
        log("warn", "job transient retry", { id: job.id, type: job.type, n: transient + 1, error: msg });
        return;
      }
      // Overload (no threads/memory, Chrome won't launch): back off longer and retry without spending an
      // attempt, up to 6 times per job. These killed paying-quality renders under load before.
      const resource = Number(job.payload.resourceRetries ?? 0);
      if (isResourceExhaustion(e) && resource < 6) {
        await this.d.db.adJob
          .update({ where: { id: job.id }, data: { payload: { ...job.payload, resourceRetries: resource + 1 } as object } })
          .catch(() => undefined);
        await releaseJob(this.d.db, job.id, 30_000 * 2 ** Math.min(resource, 4), `overloaded: ${msg}`).catch(() => undefined);
        log("warn", "job overload retry", { id: job.id, type: job.type, n: resource + 1, error: msg });
        return;
      }
      this.stats.failed++;
      const permanent = e instanceof PermanentJobError;
      const status = await failJob(
        this.d.db,
        permanent ? { ...job, attempts: job.maxAttempts } : job,
        msg,
        { durationMs: Date.now() - started, costMicros: cost() },
      ).catch(() => "failed" as const);
      if (job.runId) await syncRunCost(this.d.db, job.runId).catch(() => undefined);
      log(status === "dead" ? "error" : "warn", "job failed", { id: job.id, type: job.type, status, error: msg });
      if (status === "dead") await this.onDead(job, msg).catch((err) => log("error", "onDead failed", { error: errMsg(err) }));
    }
  }

  /** Terminal failure side-effects: fail the run or the ad (+ release credits). */
  private async onDead(job: ClaimedJob, msg: string): Promise<void> {
    const { db } = this.d;
    if ((job.type as string) === TESTIMONIAL_JOB_TYPE) {
      await onTestimonialDeadDb(db, job.payload, msg);
      return;
    }
    if ((job.type as string) === COACH_JOB_TYPE) {
      await onCoachDead(db, job.payload);
      return;
    }
    if (job.type === "plan" && job.runId && typeof job.payload.replaceAdId === "string") {
      await abandonReplacement(db, job.payload.replaceAdId);
      await maybeFinalizeRun(db, job.runId);
    } else if ((job.type === "extract" || job.type === "plan") && job.runId) {
      await failRun(db, job.runId, `${job.type}: ${msg}`);
    } else if (job.adId && job.runId && ["render_static", "render_motion", "qc"].includes(job.type)) {
      await db.ad.updateMany({ where: { id: job.adId, status: { notIn: ["ready", "failed_qc"] } }, data: { status: "failed" } });
      await requestReplacement(db, job.adId, `render failed: ${msg.slice(0, 500)}`);
      await maybeFinalizeRun(db, job.runId);
      await onBonusTerminal(db, this.d.storage, job.adId, new Date(), this.d.config.assetTtlDays);
    }
  }

  async stop(graceMs = 25_000): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    for (const t of this.timers) clearInterval(t);
    log("info", "shutting down", { active: this.active.size });
    const all = Promise.allSettled([...this.active.values()]);
    const timedOut = await Promise.race([all.then(() => false), sleep(graceMs).then(() => true)]);
    if (timedOut) {
      this.abort.abort(new Error("shutdown"));
      await Promise.race([all, sleep(5_000)]);
    }
    await this.heartbeat().catch(() => undefined);
    const b = this.browser;
    if (b) await (await b).close().catch(() => undefined);
  }

  status(): { providerOk: boolean; providerMsg?: string; active: number } {
    return { providerOk: this.providerOk, providerMsg: this.providerMsg, active: this.active.size };
  }
}

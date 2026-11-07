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
import { DEFAULT_FAIRNESS, startLaneLimits } from "./queue/fairness";
import { claimJobs, completeJob, enqueueOnce, failJob, recoverStaleJobs, releaseJob, renewLeases, type ClaimedJob } from "./queue/queue";
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
import { sleep } from "./util/sleep";

export const HANDLERS: Record<string, JobHandler> = {
  extract: (c) => extractJob(c),
  plan: planJob,
  render_static: renderJob,
  render_motion: renderJob,
  qc: qcJob,
  cleanup: cleanupJob,
  publish_meta: (c) => handlePublishMeta(c),
};
/** Job types that need the AI provider. */
export const AI_TYPES = ["extract", "plan", "render_static", "render_motion", "qc"];
export const NON_AI_TYPES = ["cleanup", "publish_meta"];
const START_TYPES = new Set(DEFAULT_FAIRNESS.start);

export interface RunnerDeps {
  db: Db;
  storage: Storage;
  provider: AIProvider;
  config: EngineConfig;
  launchBrowser: () => Promise<Browser>;
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
    every(2_000, () => sweepConfirmations(this.d.db).then((r) => (r.confirmed || r.planned) && log("info", "confirm sweep", r)), "sweeper");
    every(this.d.config.cleanupEveryMs, () => this.scheduleCleanup(), "cleanup");
    await recoverStaleJobs(this.d.db, this.d.config.staleLockMs);
    await this.scheduleCleanup();
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
        const types = this.providerOk ? [...AI_TYPES, ...NON_AI_TYPES] : NON_AI_TYPES;
        // Lane split: reserved slots are kept for start work (extract/plan) so a new run never
        // waits for long renders to finish.
        const activeStart = [...this.activeTypes.values()].filter((t) => START_TYPES.has(t)).length;
        const lim = startLaneLimits(this.d.config.concurrency, this.d.config.startLaneSlots, activeStart, this.active.size - activeStart);
        try {
          const startTypes = types.filter((t) => START_TYPES.has(t));
          // General slots take any work in fairness order (start work first); reserved-only slots take start work.
          const rest0 = lim.other > 0 ? await claimJobs(this.d.db, this.d.config.workerId, types, lim.other) : [];
          const reservedFree = lim.start - rest0.length;
          const first = reservedFree > 0 && startTypes.length ? await claimJobs(this.d.db, this.d.config.workerId, startTypes, reservedFree) : [];
          claimed = [...rest0, ...first];
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
    try {
      if (!handler) throw new PermanentJobError(`no handler for job type ${job.type}`);
      const result = await handler({
        db: this.d.db,
        storage: this.d.storage,
        provider: this.d.provider,
        config: this.d.config,
        job,
        signal: this.abort.signal,
        usage,
        now: () => new Date(),
        shared: this.shared,
      });
      await completeJob(this.d.db, job.id, { result, durationMs: Date.now() - started, costMicros: cost() });
      if (job.runId) await syncRunCost(this.d.db, job.runId).catch(() => undefined);
      this.stats.done++;
      log("info", "job done", { id: job.id, type: job.type, ms: Date.now() - started, costMicros: cost() });
    } catch (e) {
      const msg = errMsg(e);
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
    if (job.type === "plan" && job.runId && typeof job.payload.replaceAdId === "string") {
      await abandonReplacement(db, job.payload.replaceAdId);
      await maybeFinalizeRun(db, job.runId);
    } else if ((job.type === "extract" || job.type === "plan") && job.runId) {
      await failRun(db, job.runId, `${job.type}: ${msg}`);
    } else if (job.adId && job.runId && ["render_static", "render_motion", "qc"].includes(job.type)) {
      await db.ad.updateMany({ where: { id: job.adId, status: { notIn: ["ready", "failed_qc"] } }, data: { status: "failed" } });
      await requestReplacement(db, job.adId, `render failed: ${msg.slice(0, 500)}`);
      await maybeFinalizeRun(db, job.runId);
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

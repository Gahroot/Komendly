// Growth system `free_tools`: answers FreeToolJob rows queued by the public /tools pages with Codex (Luna),
// and writes the hourly heartbeat (outputs = free_tool_used events in that hour). Kill switch: sys_free_tools.
import { AI_TOOL_OUTPUT, aiToolPrompt, isAiTool } from "../../../src/lib/growth/free-tools";
import { parseBeat, recordSystemRun, systemEnabled, systemHeartbeatId } from "../../../src/lib/growth/systems";
import type { ZodType } from "zod";
import type { Db } from "../db";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import { structured } from "../providers/structured";
import type { AIProvider, UsageMeter } from "../providers/types";

export interface ClaimedToolJob { id: string; tool: string; input: unknown }

const QUEUE_TTL_MIN = 10; // the page stops polling after 2 min; older queued rows are dead
const RUNNING_TTL_MIN = 5;

/** Claim up to `limit` fresh queued jobs (FOR UPDATE SKIP LOCKED, same pattern as AdJob). */
export async function claimToolJobs(db: Pick<Db, "$queryRaw">, worker: string, limit: number): Promise<ClaimedToolJob[]> {
  return db.$queryRaw<ClaimedToolJob[]>`
    UPDATE "FreeToolJob" SET status = 'running', "lockedBy" = ${worker}, "claimedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "FreeToolJob"
      WHERE status = 'queued' AND "createdAt" > now() - make_interval(mins => ${QUEUE_TTL_MIN}::int)
      ORDER BY "createdAt" ASC LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, tool, input`;
}

/** Fail expired queued rows and rows stuck running (engine restart mid-call). */
export async function reapToolJobs(db: Pick<Db, "$executeRaw">): Promise<void> {
  await db.$executeRaw`
    UPDATE "FreeToolJob" SET status = 'failed', error = 'expired', "finishedAt" = now()
    WHERE (status = 'queued' AND "createdAt" <= now() - make_interval(mins => ${QUEUE_TTL_MIN}::int))
       OR (status = 'running' AND "claimedAt" <= now() - make_interval(mins => ${RUNNING_TTL_MIN}::int))`;
}

/** Pure-ish: run one job through the provider; returns the validated result or throws. */
export async function runToolJob(provider: AIProvider, job: ClaimedToolJob): Promise<unknown> {
  if (!isAiTool(job.tool)) throw new Error(`unknown tool ${job.tool}`);
  const input = (job.input && typeof job.input === "object" ? job.input : {}) as Record<string, string>;
  const { system, prompt } = aiToolPrompt(job.tool, input);
  const usage: UsageMeter[] = [];
  // Shared contract may resolve the root zod copy locally (same package in the image): validate via the engine type.
  return structured(provider, AI_TOOL_OUTPUT[job.tool] as unknown as ZodType, { system, prompt, reasoning: "low" }, usage);
}

export async function processToolJobs(db: Db, provider: AIProvider, worker: string, limit = 4): Promise<number> {
  const jobs = await claimToolJobs(db, worker, limit);
  await Promise.all(jobs.map(async (job) => {
    try {
      const result = await runToolJob(provider, job);
      await db.freeToolJob.update({ where: { id: job.id }, data: { status: "done", result: result as object, finishedAt: new Date() } });
    } catch (e) {
      log("warn", "free tool job failed", { id: job.id, error: errMsg(e) });
      await db.freeToolJob.update({ where: { id: job.id }, data: { status: "failed", error: errMsg(e).slice(0, 500), finishedAt: new Date() } }).catch(() => undefined);
    }
  }));
  return jobs.length;
}

/** Hourly heartbeat: outputs = tool uses (AdsEvent free_tool_used) since the previous beat (max 2h back). */
export async function freeToolsHeartbeat(db: Db, now: Date, error: string | null = null): Promise<boolean> {
  const beat = parseBeat((await db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId("free_tools") } }))?.meta);
  const last = beat.lastRunAt ? new Date(beat.lastRunAt) : null;
  if (!error && last && now.getTime() - last.getTime() < 60 * 60_000) return false;
  const from = new Date(Math.max(last?.getTime() ?? 0, now.getTime() - 2 * 3_600_000));
  const outputs = await db.adsEvent.count({ where: { name: "free_tool_used", createdAt: { gte: from, lt: now } } });
  await recordSystemRun(db, "free_tools", { ok: !error, outputs, error }, now);
  return true;
}

/** Start the loop: poll every 3s while enabled; heartbeat hourly. Model: FREE_TOOLS_MODEL (default Luna). */
export function startFreeToolsLoop(opts: { db: Db; worker: string; env?: NodeJS.ProcessEnv }): () => void {
  const env = opts.env ?? process.env;
  let provider: AIProvider | null = null;
  let stopped = false;
  let busy = false;
  let lastError: string | null = null;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      if (!(await systemEnabled(opts.db, "free_tools"))) return;
      provider ??= createProvider("codex", { ...env, CODEX_TEXT_MODEL: env.FREE_TOOLS_MODEL || "gpt-6.2-luna", TEXT_BRAIN: "codex" }, { db: opts.db, by: "engine" });
      await reapToolJobs(opts.db);
      await processToolJobs(opts.db, provider, opts.worker);
      lastError = null;
    } catch (e) {
      lastError = errMsg(e);
      log("warn", "free tools tick failed", { error: lastError });
    } finally {
      busy = false;
    }
  };
  const beat = async () => {
    try {
      if (await systemEnabled(opts.db, "free_tools")) await freeToolsHeartbeat(opts.db, new Date(), lastError);
    } catch (e) {
      log("warn", "free tools heartbeat failed", { error: errMsg(e) });
    }
  };
  const t1 = setInterval(() => void tick(), 3000);
  const t2 = setInterval(() => void beat(), 5 * 60_000);
  void beat();
  return () => { stopped = true; clearInterval(t1); clearInterval(t2); };
}

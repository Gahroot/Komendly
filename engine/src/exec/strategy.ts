// Growth system `exec_strategy` (flag sys_exec_strategy, default OFF (the owner email is the single Monday exec_brief, see coordinate.ts)): the weekly strategy engine that sits ABOVE the optimiser.
// Pure logic: src/lib/exec/*. This file: gather from AdsEvent/Postgres, ask Codex (strict JSON, EXEC_MAX_CALLS cap), heartbeat, auto-pause after 3 failed cycles.
// Part 2 (execution coordinator) consumes loadActiveObjectives / markObjective from src/lib/exec/objectives.ts. Docs: docs/exec/prd/.
import { parseBeat, recordSystemRun, systemEnabled, systemFlagKey, systemHeartbeatId } from "../../../src/lib/growth/systems";
import { gather } from "../../../src/lib/exec/gather";
import { MAX_FAILED_CYCLES, failureStreak, isoWeekKey } from "../../../src/lib/optimizer/actions";
import { buildBusinessContext } from "../../../src/lib/exec/context";
import { DEFAULT_MAX_CALLS, runExecCycle, type CycleResult } from "../../../src/lib/exec/cycle";
import type { Actual, ExecDecision } from "../../../src/lib/exec/decisions";
import { EXEC_EVENTS } from "../../../src/lib/exec/governance";
import { asObj } from "../../../src/lib/exec/types";
import type { RevenueSnapshot } from "../../../src/lib/revenue/snapshot";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import type { AIProvider } from "../providers/types";

/** Current value of a decision's metric from the latest revenue snapshot; null when unmeasurable (review then records "inconclusive"). */
export async function measureDecision(db: Db, d: ExecDecision): Promise<Actual | null> {
  if (!d.expected) return null;
  const snap = (await db.adsEvent.findFirst({ where: { name: "revenue_snapshot" }, orderBy: { createdAt: "desc" } }))?.props as RevenueSnapshot | undefined;
  const f = snap?.economics?.funnel;
  if (!f) return null;
  const m = d.expected.metric.toLowerCase();
  const value = /paying|customer/.test(m) ? snap!.economics.payingCustomers : /sign/.test(m) ? f.signups : /activat/.test(m) ? f.activated : /purchase|unlock/.test(m) ? f.firstPurchases : null;
  if (value === null) return null;
  return { value, n: f.signups, evidence: [{ level: "measured", text: `${d.expected.metric} = ${value} per revenue_snapshot ${snap!.day}`, eventId: "revenue_snapshot" }] };
}

/** EXEC_DRY_RUN writes no exec_cycle event, so runExecCycle's once-per-ISO-week idempotency never finds a prior cycle and every 30-min tick
 * would re-run the whole cycle (up to EXEC_MAX_CALLS high-reasoning Codex calls). The heartbeat's lastOkAt (persisted, survives restarts) stands in for it. */
export function dryRunCycleDoneThisWeek(beat: { lastOkAt: string | null }, now: Date): boolean {
  return Boolean(beat.lastOkAt) && isoWeekKey(new Date(beat.lastOkAt as string)) === isoWeekKey(now);
}

export async function execCycle(o: { db: Db; provider: AIProvider; env: NodeJS.ProcessEnv; now: Date; forced: boolean }): Promise<CycleResult> {
  const stop = await o.db.adsEvent.findFirst({ where: { name: "ops_emergency_stop" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const resume = stop ? await o.db.adsEvent.findFirst({ where: { name: "ops_emergency_resume", createdAt: { gt: stop.createdAt } }, select: { id: true } }) : null;
  const maxCalls = Number(o.env.EXEC_MAX_CALLS) > 0 ? Number(o.env.EXEC_MAX_CALLS) : DEFAULT_MAX_CALLS;
  return runExecCycle({
    db: o.db, now: o.now, forced: o.forced, dryRun: o.env.EXEC_DRY_RUN === "1", maxCalls, emergencyStopActive: Boolean(stop && !resume),
    gather: () => gather(o.db, o.now),
    ask: async (r) => (await o.provider.text({ system: r.system, prompt: r.prompt, jsonSchema: r.schema, reasoning: "high" })).json,
    measure: (d) => measureDecision(o.db, d),
  });
}

/** Daily context snapshot (AdsEvent exec_context) even between weekly cycles. */
export async function storeDailyContext(db: Db, now: Date): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const last = await db.adsEvent.findFirst({ where: { name: EXEC_EVENTS.context, createdAt: { gte: new Date(`${day}T00:00:00Z`) } }, select: { id: true } });
  if (last) return false;
  await db.adsEvent.create({ data: { name: EXEC_EVENTS.context, props: buildBusinessContext(await gather(db, now)) as unknown as object } });
  return true;
}

export async function autoPauseIfFailing(db: Db, send: SendMail | undefined, env: NodeJS.ProcessEnv, now: Date): Promise<boolean> {
  const rows = await db.adsEvent.findMany({ where: { name: EXEC_EVENTS.cycle }, orderBy: { createdAt: "desc" }, take: MAX_FAILED_CYCLES, select: { props: true } });
  const outcomes = rows.reverse().map((r) => (asObj(r.props).ok === true || asObj(r.props).status === "paused_by_owner" ? "ok" : "failed") as "ok" | "failed");
  if (failureStreak(outcomes) < MAX_FAILED_CYCLES) return false;
  await db.adsFeatureFlag.updateMany({ where: { key: systemFlagKey("exec_strategy") }, data: { enabled: false } });
  await db.adsEvent.create({ data: { name: EXEC_EVENTS.paused, props: { reason: `${MAX_FAILED_CYCLES} consecutive failed cycles`, at: now.toISOString() } } });
  if (env.ADS_ALERT_EMAIL && send) await send({ to: env.ADS_ALERT_EMAIL, subject: "Executive strategy engine paused after 3 failed cycles", text: "sys_exec_strategy failed 3 cycles in a row and switched itself OFF. See AdsEvent exec_cycle. Fix the cause, then switch it back ON.", html: "<p>sys_exec_strategy failed 3 cycles in a row and switched itself OFF. See AdsEvent <code>exec_cycle</code>.</p>", headers: {} }).catch(() => undefined);
  return true;
}

export function startExecStrategyLoop(opts: { db: Db; send?: SendMail; env?: NodeJS.ProcessEnv }): () => void {
  const env = opts.env ?? process.env;
  let provider: AIProvider | null = null;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!(await systemEnabled(opts.db, "exec_strategy"))) return;
      const now = new Date();
      await storeDailyContext(opts.db, now).catch((e) => log("warn", "exec: daily context failed", { error: errMsg(e) }));
      const lastCycle = await opts.db.adsEvent.findFirst({ where: { name: EXEC_EVENTS.cycle }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      const req = await opts.db.adsEvent.findFirst({ where: { name: EXEC_EVENTS.runRequest, ...(lastCycle ? { createdAt: { gt: lastCycle.createdAt } } : {}) }, orderBy: { createdAt: "desc" }, select: { id: true } });
      const beat = parseBeat((await opts.db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId("exec_strategy") } }))?.meta);
      if (beat.lastError && !req && beat.lastRunAt && now.getTime() - new Date(beat.lastRunAt).getTime() < 6 * 3_600_000) return; // back off after a failure
      if (env.EXEC_DRY_RUN === "1" && !req && dryRunCycleDoneThisWeek(beat, now)) return; // dry run already proposed this week (see dryRunCycleDoneThisWeek)
      provider ??= createProvider("codex", { ...env, TEXT_BRAIN: "codex" }, { db: opts.db, by: "engine" });
      const r = await execCycle({ db: opts.db, provider, env, now, forced: Boolean(req) });
      if (r.status === "skipped") return;
      if (r.status === "ok" || r.status === "paused_by_owner") await recordSystemRun(opts.db, "exec_strategy", { ok: true, outputs: r.objectives });
      else {
        await recordSystemRun(opts.db, "exec_strategy", { ok: false, error: Object.values(r.stepErrors)[0] ?? r.notes[0] ?? r.status });
        if (await autoPauseIfFailing(opts.db, opts.send, env, now)) log("warn", "exec strategy auto-paused after repeated failures");
      }
    } catch (e) {
      log("warn", "exec strategy tick failed", { error: errMsg(e) });
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 30 * 60_000);
  const first = setTimeout(() => void tick(), 90_000);
  return () => { clearInterval(timer); clearTimeout(first); };
}

// Growth system `exec_strategy` (flag sys_exec_strategy, default OFF; digest flag sys_exec_digest): the weekly strategy engine that sits ABOVE the optimiser.
// Pure logic: src/lib/exec/*. This file: gather from AdsEvent/Postgres, ask Codex (strict JSON, EXEC_MAX_CALLS cap), heartbeat, auto-pause after 3 failed cycles.
// Part 2 (execution coordinator) consumes loadActiveObjectives / markObjective from src/lib/exec/objectives.ts. Docs: docs/exec/prd/.
import { SPEND_AUTHORITY } from "../../../src/lib/ops/finance/authority";
import { GROWTH_SYSTEMS, parseBeat, recordSystemRun, systemEnabled, systemFlagKey, systemHeartbeatId } from "../../../src/lib/growth/systems";
import { countBySource } from "../../../src/lib/growth/ecosystem";
import { MAX_FAILED_CYCLES, failureStreak } from "../../../src/lib/optimizer/actions";
import { buildBusinessContext, type ContextInput } from "../../../src/lib/exec/context";
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

const since = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

export async function gather(db: Db, now: Date): Promise<ContextInput> {
  const ev = (name: string, take: number, days = 120) => db.adsEvent.findMany({ where: { name, createdAt: { gte: since(now, days) } }, orderBy: { createdAt: "desc" }, take });
  const [snaps, signupEv, payEv, fin, inc, infra, status, opt, opsDec, expEv, ownerEv, proposals, learn, replies] = await Promise.all([
    ev("revenue_snapshot", 1, 30), ev("signed_up", 3000, 90), ev("ads_payment_alerted", 500, 365), ev("finance_snapshot", 1, 30), ev("incident", 50, 30), ev("infra_check", 30, 3),
    ev("system_status", 60, 3), ev("optimizer_action", 20, 120), ev("ops_decision", 20, 120), ev("experiment_defined", 50), ev("optimizer_owner_decision", 10, 30), ev("offer_proposal", 40), ev("learning", 20, 120), ev("reply_classified", 500, 60),
  ]);
  const snapshot = (snaps[0]?.props ?? null) as RevenueSnapshot | null;
  const flagRows = await db.adsFeatureFlag.findMany({ take: 500 });
  const flags: Record<string, boolean> = Object.fromEntries(flagRows.map((f) => [f.key, f.enabled]));
  const payers = new Set(payEv.flatMap((e) => (e.workspaceId ? [e.workspaceId] : [])));
  const by = countBySource(signupEv.flatMap((e) => { const p = asObj(e.props), ft = asObj(p.firstTouch); return e.workspaceId ? [{ workspaceId: e.workspaceId, utmSource: (ft.utm_source as string) ?? null, referrerHost: (ft.referrer_host as string) ?? null, klyLead: Boolean(p.klyLead) }] : []; }), payers);
  const channels: ContextInput["channels"] = [];
  for (const s of GROWTH_SYSTEMS) {
    const c = by.get(s.utmSource);
    const beat = parseBeat((await db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(s.key) } }).catch(() => null))?.meta);
    if (c || beat.outputs) channels.push({ source: s.utmSource, label: s.label, actions: beat.outputs, signups: c?.signups ?? 0, payments: c?.payments ?? 0, flagOn: flags[systemFlagKey(s.key)] === true });
  }
  // latest infra_check per row; latest system_status per capability id
  const statuses = new Map<string, string>();
  for (const e of status) { const p = asObj(e.props); const id = String(p.id ?? p.key ?? ""); if (id && !statuses.has(id)) statuses.set(id, String(p.status ?? "")); }
  const openInc = inc.filter((e) => { const p = asObj(e.props); return p.status !== "resolved" && p.status !== "closed"; });
  const classified = replies.map((e) => asObj(e.props));
  const cls = (k: string) => classified.filter((p) => p.category === k || p.intent === k).length;
  const customerVoice = classified.length ? { replies: classified.length, priceObjections: cls("price"), offerObjections: cls("offer") + cls("unclear"), noInterest: cls("no_need") + cls("not_interested") } : null;
  return {
    now, snapshot, channels, flags,
    finance: fin[0] ? { props: asObj(fin[0].props) } : null,
    incidents: inc.length ? { open: openInc.length, recent: openInc.slice(0, 5).map((e) => asObj(e.props)) } : null,
    infra: infra.length ? { failures: infra.filter((e) => asObj(e.props).ok === false).length, total: infra.length } : null,
    systemStatus: statuses.size ? [...statuses].map(([id, st]) => ({ id, status: st })) : null,
    competitive: null, // docs/product/competitive.json is not shipped in the engine image; wire an AdsEvent when the product worker emits one
    spendAuthority: { ...SPEND_AUTHORITY },
    ownerDecisions: ownerEv.map((e) => ({ text: String(asObj(e.props).title ?? ""), at: e.createdAt.toISOString() })),
    optimizerActions: opt.map((e) => asObj(e.props)), opsDecisions: opsDec.map((e) => asObj(e.props)), learnings: learn.map((e) => asObj(e.props)),
    experiments: expEv.map((e) => ({ key: String(asObj(e.props).key ?? ""), status: "defined", hypothesis: typeof asObj(e.props).hypothesis === "string" ? String(asObj(e.props).hypothesis) : undefined })).filter((x) => x.key),
    hypotheses: proposals.flatMap((e) => (typeof asObj(e.props).hypothesis === "string" ? [{ text: String(asObj(e.props).hypothesis) }] : [])),
    customerVoice, outcomes: null,
  };
}

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

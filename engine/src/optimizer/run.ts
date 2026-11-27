// Growth system `optimizer` (flag sys_optimizer, default OFF; digest flag sys_optimizer_digest): the weekly business loop.
// Pure logic lives in src/lib/optimizer/*; this file does the I/O: gather from AdsEvent/Postgres, ask Codex (strict JSON),
// execute allow-listed actions, record AdsEvents, heartbeat (recordSystemRun), auto-pause after 3 failed cycles.
// Docs: docs/revenue/optimizer.md.
import { countBySource, formatLearning, type SourceStats } from "../../../src/lib/growth/ecosystem";
import { rank, perfsFromEvents, type ReadyLite } from "../../../src/lib/growth/reels-learning";
import { GROWTH_SYSTEMS, parseBeat, recordSystemRun, systemEnabled, systemFlagKey, systemHeartbeatId } from "../../../src/lib/growth/systems";
import { MAX_FAILED_CYCLES, failureStreak, hypothesisHash, isoWeekKey, type ArmView, type ExperimentView, type ProposalView, type ValidAction } from "../../../src/lib/optimizer/actions";
import { runOptimizerCycle, type CycleDeps, type CycleResult, type Gathered } from "../../../src/lib/optimizer/cycle";
import { parseSnapshot } from "../../../src/lib/optimizer/diagnose";
import { digestAbsorbed, recordDigestSent } from "../../../src/lib/exec/digest-dedupe";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import type { AIProvider } from "../providers/types";

/** The rev-core API (src/lib/revenue/experiments.ts). Loaded lazily so this job works before that module ships. */
export interface ExperimentsApi {
  loadExperimentResults(db: unknown, key: string): Promise<unknown>;
  evaluateExperiment?(counts: unknown): unknown;
  defineExperiment(db: unknown, def: unknown): Promise<unknown>;
  concludeExperiment(db: unknown, key: string, winnerId: string, evidence: unknown): Promise<unknown>;
}
export async function loadExperimentsApi(): Promise<ExperimentsApi | null> {
  try {
    const path = "../../../src/lib/revenue/experiments"; // computed so tsc/bundlers do not require the file to exist yet
    const m = (await import(/* @vite-ignore */ path)) as Partial<ExperimentsApi>;
    return m.loadExperimentResults && m.defineExperiment && m.concludeExperiment ? (m as ExperimentsApi) : null;
  } catch {
    return null;
  }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const since = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

/** Tolerant mapping of rev-core's loadExperimentResults output to what the guardrails need. */
export function toExperimentView(key: string, raw: unknown, fallbackSurface = "unknown"): ExperimentView {
  const r = obj(raw);
  const vs = Array.isArray(r.variants) ? r.variants : [];
  return {
    key,
    surface: String(r.surface ?? fallbackSurface),
    status: String(r.status ?? "running"),
    variants: vs.map((v) => { const o = obj(v); return { id: String(o.id ?? o.variantId ?? ""), n: num(o.n ?? o.exposures ?? o.visitors ?? o.sends), conversions: num(o.conversions ?? o.successes ?? o.paid) }; }).filter((v) => v.id),
  };
}

export async function gather(db: Db, now: Date, api: ExperimentsApi | null): Promise<Gathered & { proposalDefs: Map<string, unknown> }> {
  const ev = (name: string, take: number, days = 120) => db.adsEvent.findMany({ where: { name, createdAt: { gte: since(now, days) } }, orderBy: { createdAt: "desc" }, take });
  const [snaps, signupEv, payEv, proposalsEv, successEv, reelReady, reelIns, expEv, ledgerEv, ownerEv, optExp] = await Promise.all([
    ev("revenue_snapshot", 1, 30), ev("signed_up", 3000, 90), ev("ads_payment_alerted", 500, 365), ev("offer_proposal", 40), ev("customer_success_finding", 15, 60),
    ev("reel_ready", 200, 60), ev("reel_insights", 400, 60), ev("experiment_defined", 50), ev("optimizer_ledger", 200, 400), ev("optimizer_owner_decision", 10, 30), ev("optimizer_action", 100, 120),
  ]);
  const snapshot = snaps[0] ? parseSnapshot(snaps[0].props) : null;

  // acquisition: signups/payments by first touch, per growth system
  const payers = new Set(payEv.flatMap((e) => (e.workspaceId ? [e.workspaceId] : [])));
  const by = countBySource(signupEv.flatMap((e) => { const p = obj(e.props), ft = obj(p.firstTouch); return e.workspaceId ? [{ workspaceId: e.workspaceId, utmSource: (ft.utm_source as string) ?? null, referrerHost: (ft.referrer_host as string) ?? null, klyLead: Boolean(p.klyLead) }] : []; }), payers);
  const channels: SourceStats[] = [];
  for (const s of GROWTH_SYSTEMS) {
    const c = by.get(s.utmSource);
    const beat = parseBeat((await db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId(s.key) } }).catch(() => null))?.meta);
    if (!c && !beat.outputs) continue;
    channels.push({ source: s.utmSource, label: s.label, actions: beat.outputs, signups: c?.signups ?? 0, payments: c?.payments ?? 0, flag: systemFlagKey(s.key), flagOn: await systemEnabled(db, s.key) });
  }
  for (const [source, c] of by) if (!GROWTH_SYSTEMS.some((s) => s.utmSource === source)) channels.push({ source, label: source, actions: null, signups: c.signups, payments: c.payments });

  // kly
  const armRows = await db.klyArm.findMany({ where: { status: { not: "retired" } }, orderBy: [{ dimension: "asc" }, { key: "asc" }], take: 200 });
  const arms: ArmView[] = armRows.map((a) => ({ id: a.id, dimension: a.dimension, key: a.key, status: a.status, sends: a.sends, positiveReplies: a.positiveReplies, signups: a.signups, paid: a.paid }));

  // reels
  const ready: ReadyLite[] = reelReady.flatMap((e) => { const p = obj(e.props); return p.reelId ? [{ reelId: String(p.reelId), hookId: String(p.hookId ?? ""), trade: String(p.trade ?? ""), format: p.format as ReadyLite["format"], seconds: num(p.seconds) }] : []; });
  const insights = reelIns.flatMap((e) => { const p = obj(e.props); return p.reelId ? [{ reelId: String(p.reelId), platform: String(p.platform ?? ""), metrics: obj(p.metrics) as Record<string, number>, at: e.createdAt }] : []; });
  const perfs = perfsFromEvents(ready, insights);
  const reels = { reelsMeasured: perfs.length, topHooks: rank(perfs, "hookId").slice(0, 3), topTrades: rank(perfs, "trade").slice(0, 3) };

  // proposals + experiments
  const proposalDefs = new Map<string, unknown>();
  const proposals: ProposalView[] = proposalsEv.flatMap((e) => {
    const p = obj(e.props), key = String(p.key ?? p.experimentKey ?? "");
    if (!key || proposalDefs.has(key)) return [];
    proposalDefs.set(key, p.definition ?? p.experiment ?? p);
    return [{ key, surface: String(p.surface ?? "offer"), hypothesis: String(p.hypothesis ?? ""), validated: p.validated === true || p.status === "validated", status: p.status as string | undefined }];
  });
  const keys = new Set<string>([...expEv.map((e) => String(obj(e.props).key ?? "")), ...optExp.filter((e) => obj(e.props).type === "start_experiment" && obj(e.props).ok === true).map((e) => String(obj(obj(e.props).params).key ?? ""))].filter(Boolean));
  const experiments: ExperimentView[] = [];
  if (api) for (const k of keys) { try { experiments.push(toExperimentView(k, await api.loadExperimentResults(db, k), proposals.find((p) => p.key === k)?.surface)); } catch (e) { log("warn", "optimizer: experiment load failed", { key: k, error: errMsg(e) }); } }

  const ledger = ledgerEv.flatMap((e) => { const p = obj(e.props); return p.hash ? [{ hash: String(p.hash), at: String(p.at ?? e.createdAt.toISOString()), outcome: p.outcome as "failed" | "suspended" | "won", conditionsKey: p.conditionsKey as string | undefined }] : []; });
  const kly = { activeArms: arms.length, topArms: [...arms].sort((a, b) => b.positiveReplies + b.signups - (a.positiveReplies + a.signups)).slice(0, 8) };
  const facts = {
    registry: "see channels", channels: channels.slice(0, 25), kly, reels,
    customerSuccess: successEv.slice(0, 8).map((e) => e.props), openOwnerDecisions: ownerEv.map((e) => obj(e.props).title),
    snapshot: snaps[0]?.props ?? null, experimentsApi: api ? "available" : "unavailable (no experiment actions possible)",
  };
  return { snapshot, payingCustomers: payers.size, facts, guard: { experiments, proposals, arms: armRows.length ? arms : [], channels, ledger }, proposalDefs };
}

export interface OptimizerDeps { db: Db; provider: AIProvider; send?: SendMail; env: NodeJS.ProcessEnv; now: Date; api?: ExperimentsApi | null }

export async function executeAction(d: OptimizerDeps, api: ExperimentsApi | null, defs: Map<string, unknown>, v: ValidAction, week: string, now: Date): Promise<string> {
  const p = v.params;
  const rec = (name: string, props: object) => d.db.adsEvent.create({ data: { name, props: props as object } });
  switch (v.type) {
    case "conclude_experiment": {
      if (!api) throw new Error("experiments module unavailable");
      const evidence = { by: "optimizer", week, reason: v.action.reason, counts: p.counts };
      await api.concludeExperiment(d.db, String(p.key), String(p.winnerId), evidence);
      if (String(p.winnerId) === "control") await rec("optimizer_ledger", { hash: hypothesisHash(String(p.key), v.action.hypothesis), outcome: "failed", at: now.toISOString(), key: p.key });
      return `conclude experiment ${p.key} with winner ${p.winnerId}`;
    }
    case "start_experiment": {
      if (!api) throw new Error("experiments module unavailable");
      const def = defs.get(String(p.key));
      if (!def) throw new Error("proposal definition missing");
      await api.defineExperiment(d.db, def);
      return `start validated experiment ${p.key} on ${p.surface}`;
    }
    case "retire_arm": {
      const r = await d.db.klyArm.updateMany({ where: { id: String(p.armId), status: "active" }, data: { status: "retired", retiredAt: now } });
      if (!r.count) throw new Error("arm no longer active");
      return `retire cold-email arm ${p.dimension}/${p.key}`;
    }
    case "shift_emphasis": {
      await rec("optimizer_emphasis", { surface: p.surface, prefer: p.prefer, avoid: p.avoid, week, at: now.toISOString() });
      return `shift ${p.surface} emphasis toward [${(p.prefer as string[]).join(", ")}] away from [${(p.avoid as string[]).join(", ")}]`;
    }
    case "suspend_system": {
      const r = await d.db.adsFeatureFlag.updateMany({ where: { key: String(p.flag), enabled: true }, data: { enabled: false } });
      if (!r.count) throw new Error("flag already off");
      await rec("optimizer_ledger", { hash: hypothesisHash(String(p.source), `channel ${p.source} produces sign-ups`), outcome: "suspended", at: now.toISOString() });
      return `switch ${p.flag} OFF (no sign-ups after 500+ actions)`;
    }
    case "owner_decision": {
      await rec("optimizer_owner_decision", { title: p.title, detail: p.detail, status: "open", week });
      return `add to the needs-you list: ${p.title}`;
    }
  }
}

/** Last ok cycle's ISO week, for idempotency. */
async function lastOkWeek(db: Db): Promise<string | null> {
  const r = await db.adsEvent.findFirst({ where: { name: "optimizer_cycle", props: { path: ["ok"], equals: true } }, orderBy: { createdAt: "desc" }, select: { props: true } });
  const w = obj(r?.props).week;
  return typeof w === "string" ? w : null;
}

export async function optimizerCycle(d: OptimizerDeps & { forced?: boolean }): Promise<CycleResult> {
  const api = d.api === undefined ? await loadExperimentsApi() : d.api;
  let defs = new Map<string, unknown>();
  const deps: CycleDeps = {
    now: d.now, env: d.env, forced: Boolean(d.forced), adminUrl: `${(d.env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "")}/admin/ads/revenue`,
    enabled: () => systemEnabled(d.db, "optimizer"),
    lastWeek: () => lastOkWeek(d.db),
    gather: async () => { const g = await gather(d.db, d.now, api); defs = g.proposalDefs; return g; },
    decide: async (req) => { const r = await d.provider.text({ ...req, reasoning: "high" }); return { json: r.json, text: r.text }; },
    execute: (v, c) => (c.dryRun ? dryDescribe(v) : executeAction(d, api, defs, v, c.week, d.now)),
    record: async (name, props) => { await d.db.adsEvent.create({ data: { name, props: props as object } }); },
    digestEnabled: async () => (await systemEnabled(d.db, "optimizer_digest")) && !(await digestAbsorbed(d.db, "optimizer_digest")), // sys_exec_brief ON: exec brief absorbs it
    sendDigest: d.send ? async (m) => { await d.send!({ to: d.env.OPTIMIZER_DIGEST_TO || "nolan@prestyj.com", subject: m.subject, text: m.text, html: `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${m.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`, headers: {} }); await recordDigestSent(d.db, "optimizer_digest", isoWeekKey(d.now)); } : undefined,
  };
  return runOptimizerCycle(deps);
}

function dryDescribe(v: ValidAction): Promise<string> {
  return Promise.resolve(`${v.type} ${JSON.stringify(v.params).slice(0, 160)}`);
}

/** After a failed cycle: 3 in a row = switch the optimiser OFF and alert the owner. Returns true when paused. */
export async function autoPauseIfFailing(db: Db, send: SendMail | undefined, env: NodeJS.ProcessEnv, now: Date): Promise<boolean> {
  const rows = await db.adsEvent.findMany({ where: { name: "optimizer_cycle" }, orderBy: { createdAt: "desc" }, take: MAX_FAILED_CYCLES, select: { props: true } });
  const outcomes = rows.reverse().map((r) => (obj(r.props).ok === true ? "ok" : "failed") as "ok" | "failed");
  if (failureStreak(outcomes) < MAX_FAILED_CYCLES) return false;
  await db.adsFeatureFlag.updateMany({ where: { key: systemFlagKey("optimizer") }, data: { enabled: false } });
  await db.adsEvent.create({ data: { name: "optimizer_paused", props: { reason: `${MAX_FAILED_CYCLES} consecutive failed cycles`, at: now.toISOString() } } });
  const to = env.ADS_ALERT_EMAIL;
  if (to && send) await send({ to, subject: "Optimiser paused after 3 failed weekly cycles", text: `The optimiser (sys_optimizer) failed ${MAX_FAILED_CYCLES} cycles in a row and switched itself OFF. Last errors are in AdsEvent optimizer_cycle. Fix the cause, then switch sys_optimizer back ON.`, html: "<p>The optimiser failed 3 cycles in a row and switched itself OFF. See AdsEvent <code>optimizer_cycle</code>. Switch <code>sys_optimizer</code> back ON after the fix.</p>", headers: {} }).catch(() => undefined);
  return true;
}

/** Learning text in the repo's learnings format (docs/revenue/learnings.md); an operator appends it with learnings-file.ts. */
export const learningMarkdown = (date: string, kind: "evidence" | "assumption", title: string, note: string, source: string) => formatLearning({ date, kind, title, note, source });

export function startOptimizerLoop(opts: { db: Db; send?: SendMail; env?: NodeJS.ProcessEnv }): () => void {
  const env = opts.env ?? process.env;
  let provider: AIProvider | null = null;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      if (!(await systemEnabled(opts.db, "optimizer"))) return;
      const now = new Date();
      const beat = parseBeat((await opts.db.engineHeartbeat.findUnique({ where: { id: systemHeartbeatId("optimizer") } }))?.meta);
      const lastCycle = await opts.db.adsEvent.findFirst({ where: { name: "optimizer_cycle" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      const req = await opts.db.adsEvent.findFirst({ where: { name: "optimizer_run_request", ...(lastCycle ? { createdAt: { gt: lastCycle.createdAt } } : {}) }, orderBy: { createdAt: "desc" }, select: { id: true } });
      if (beat.lastError && !req && beat.lastRunAt && now.getTime() - new Date(beat.lastRunAt).getTime() < 6 * 3_600_000) return; // back off after a failure
      provider ??= createProvider("codex", { ...env, TEXT_BRAIN: "codex" }, { db: opts.db, by: "engine" });
      const r = await optimizerCycle({ db: opts.db, provider, send: opts.send, env, now, forced: Boolean(req) });
      if (r.status === "skipped") return;
      if (r.status === "ok") await recordSystemRun(opts.db, "optimizer", { ok: true, outputs: r.executed });
      else {
        await recordSystemRun(opts.db, "optimizer", { ok: false, error: r.error });
        if (await autoPauseIfFailing(opts.db, opts.send, env, now)) log("warn", "optimizer auto-paused after repeated failures");
      }
    } catch (e) {
      log("warn", "optimizer tick failed", { error: errMsg(e) });
    } finally {
      busy = false;
    }
  };
  const t = setInterval(() => void tick(), 30 * 60_000);
  const first = setTimeout(() => void tick(), 90_000);
  return () => { clearInterval(t); clearTimeout(first); };
}

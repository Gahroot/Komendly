// Growth systems `exec_coordinator` (flag sys_exec_coordinator) and `exec_brief` (flag sys_exec_brief), both default OFF.
// Daily tick, single replica. Takes ACTIVE approved objectives (loadActiveObjectives semantics: owner/auto-approved, not paused/vetoed) and routes them
// to ALLOW-LISTED, reversible dispatch actions (src/lib/exec/coordinator.ts). Code changes are NEVER executed: they become `build_request` events
// (scripts/exec-build-queue.ts). Weekly: performance, risks, opportunity pass (Codex, strict JSON, capped calls), and ONE Monday executive brief.
// Never moves money, never raises authority, never turns on sending flags. Writes only exec_* / build_request / proposals / flags within the allow-list.
import { defineExperiment, concludeExperiment, type ExperimentDef } from "../../../src/lib/revenue/experiments";
import { describe, strategicCycle } from "../../../src/lib/exec/strategic-cycle";
import { digestAlreadySent, recordDigestSent } from "../../../src/lib/exec/digest-dedupe";
import { EXEC_AUTHORITY } from "../../../src/lib/exec/authority-defaults";
import type { DispatchAction, PlannedAction } from "../../../src/lib/exec/coordinator";
import { markObjective } from "../../../src/lib/exec/objectives";
import { E, isoWeek, loadCycleInput } from "../../../src/lib/exec/load";
import { allowedStrategiesFor, buildOpportunityPrompt, judgeOpportunities, OPPORTUNITY_SCHEMA, OPPORTUNITY_SYSTEM, parseOpportunities } from "../../../src/lib/exec/opportunities";
import { recordSystemRun, systemEnabled } from "../../../src/lib/growth/systems";
import type { Db } from "../db";
import type { SendMail } from "../lifecycle/mail";
import { errMsg, log } from "../log";
import { createProvider } from "../providers/index";
import type { AIProvider } from "../providers/types";

export interface ExecDeps { db: Db; send?: SendMail; env?: NodeJS.ProcessEnv; now?: Date; provider?: AIProvider; dryRun?: boolean; forceBrief?: boolean }
export interface ExecTickResult { ran: boolean; stage?: string; planned: string[]; rejected: string[]; wrote: number; briefSent: boolean; wouldWrite?: Array<{ name: string; props: unknown }> }
const html = (t: string) => `<pre style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
const j = (v: unknown) => JSON.parse(JSON.stringify(v)) as object;

export async function execTick(d: ExecDeps): Promise<ExecTickResult> {
  const now = d.now ?? new Date(), env = d.env ?? process.env, db = d.db;
  const coord = await systemEnabled(db, "exec_coordinator"), briefOn = await systemEnabled(db, "exec_brief");
  const res: ExecTickResult = { ran: false, planned: [], rejected: [], wrote: 0, briefSent: false, wouldWrite: [] };
  if (!coord && !briefOn && !d.dryRun) return res;
  const dry = Boolean(d.dryRun);
  const write = async (name: string, props: unknown) => { if (dry) { res.wouldWrite!.push({ name, props }); return; } await db.adsEvent.create({ data: { name, props: j(props) } }); res.wrote++; };
  const adminUrl = `${(env.NEXT_PUBLIC_APP_URL || "https://www.komendly.com").replace(/\/$/, "")}/admin/ads/executive`;
  try {
    const { input, measured } = await loadCycleInput(db, now, adminUrl);
    const out = strategicCycle(input);
    res.ran = true; res.stage = out.stage;
    const week = isoWeek(now);
    const weekly = !(await db.adsEvent.findFirst({ where: { name: E.run, props: { path: ["week"], equals: week } }, select: { id: true } }).catch(() => null));

    if (coord || dry) {
      for (const p of out.planned) {
        res.planned.push(describe(p.action));
        const r: Outcome | { status: "dry_run"; detail: string; extra?: Record<string, unknown> } = dry ? { status: "dry_run" as const, detail: "not executed" } : await execute(db, p, now);
        await write(E.dispatch, { objectiveId: p.objectiveId, key: p.key, type: p.action.type, status: r.status, detail: r.detail, summary: describe(p.action), reversible: p.reversible, undo: p.undo, ...r.extra });
        if (!dry && r.status !== "failed") await progress(db, input.objectives.find((o) => o.id === p.objectiveId)?.status, p.objectiveId, `dispatched ${p.action.type}`);
      }
      // objectives whose checkpoint is due move to verification (never "done": a human/strategy engine concludes)
      if (!dry) await dueCheckpoints(db, now);
      // verify -> close -> learn: objectives already in "verifying" are concluded with their measured outcome (the next strategy cycle reassesses from there)
      for (const c of out.closures) {
        await write(E.dispatch, { objectiveId: c.objectiveId, status: "closed", type: "closure", outcome: c.outcome, detail: c.evidence, metric: c.metric, current: c.current, target: c.target });
        if (!dry) await markObjective(db, c.objectiveId, "done", { outcome: c.outcome, evidence: c.evidence, metric: c.metric, current: c.current, target: c.target, by: "exec-coordinator" }).catch(() => undefined);
      }
      if (weekly) {
        for (const r of out.rejected) { res.rejected.push(r.reason); await write(E.dispatch, { objectiveId: r.objectiveId, status: "rejected", reason: r.reason, action: j(r.action ?? null) }); }
        for (const t of out.tracked.filter((x) => x.stalled || x.duplicateOf || x.abandoned)) await write(E.dispatch, { objectiveId: t.id, status: "flagged", reason: t.stalled ? `stalled: no activity for ${t.daysSinceActivity} days` : t.duplicateOf ? `duplicate of ${t.duplicateOf}` : `proposed ${t.ageDays} days with no decision`, owner: t.owner });
        for (const c of out.conflicts) await write(E.dispatch, { status: "flagged", reason: `conflict between ${c.a} and ${c.b}: ${c.why}` });
        for (const p of out.performance) await write("exec_performance", { week, ...p });
        for (const r of out.risks) await write(E.risk, { week, ...r });
        await write("exec_allocation", { week, ...out.allocation });
        for (const f of out.org.findings) await write("exec_org_finding", { week, ...f });
        await opportunityPass(d, out.stage, input.constraint?.label ?? null, write, week);
        await write(E.run, { week, stage: out.stage, constraint: input.constraint?.label ?? null, planned: out.planned.length, rejected: out.rejected.length, measured });
      }
      if (!dry) await recordSystemRun(db, "exec_coordinator", { ok: true, outputs: out.planned.length }, now);
    }

    if (briefOn || dry) {
      const monday = now.getUTCDay() === 1 && now.getUTCHours() >= 12;
      if ((monday || d.forceBrief) && (dry || !(await digestAlreadySent(db, "exec_brief", week)))) {
        const needs = await db.adsEvent.findMany({ where: { name: "optimizer_owner_decision", createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, take: 3, select: { props: true } }).catch(() => []);
        const extra = needs.map((n) => ({ question: String((n.props as { title?: string })?.title ?? "Optimiser needs a decision"), recommended: "see the ops page" }));
        const out2 = strategicCycle({ ...input, openOwnerItems: [...input.openOwnerItems, ...extra] });
        const to = env.EXEC_BRIEF_TO || env.ADS_ALERT_EMAIL || "nolan@prestyj.com";
        // No notification spam: send only when something changed or a decision is needed.
        const worth = out2.brief.hasContent;
        if (worth && d.send && !dry) { await d.send({ to, subject: out2.brief.subject, text: out2.brief.text, html: html(out2.brief.text), headers: {} }); res.briefSent = true; }
        if (dry) res.wouldWrite!.push({ name: "brief_email", props: { worth, subject: out2.brief.subject, text: out2.brief.text } });
        if (!dry) { await recordDigestSent(db, "exec_brief", week); await recordSystemRun(db, "exec_brief", { ok: true, outputs: res.briefSent ? 1 : 0 }, now); }
      }
    }
  } catch (e) {
    if (!dry) { await recordSystemRun(db, "exec_coordinator", { ok: false, error: errMsg(e) }, now); }
    log("error", "exec tick failed", { error: errMsg(e) });
    throw e;
  }
  return res;
}

async function progress(db: Db, status: string | undefined, id: string, note: string) {
  if (status === "approved") await markObjective(db, id, "active", { note, by: "exec-coordinator" }).catch(() => undefined);
}

async function dueCheckpoints(db: Db, now: Date) {
  const rows = await db.adsEvent.findMany({ where: { name: E.dispatch, props: { path: ["type"], equals: "checkpoint" } }, orderBy: { createdAt: "desc" }, take: 100, select: { props: true } }).catch(() => []);
  for (const r of rows) {
    const p = (r.props ?? {}) as { objectiveId?: string; dueAt?: string; status?: string; verifyMarked?: boolean };
    if (!p.objectiveId || !p.dueAt || p.status !== "executed" || new Date(p.dueAt) > now) continue;
    const marked = await db.adsEvent.findFirst({ where: { name: E.dispatch, AND: [{ props: { path: ["objectiveId"], equals: p.objectiveId } }, { props: { path: ["status"], equals: "verification_started" } }] }, select: { id: true } }).catch(() => null);
    if (marked) continue;
    await markObjective(db, p.objectiveId, "verifying", { note: "measurement checkpoint reached", dueAt: p.dueAt }).catch(() => undefined);
    await db.adsEvent.create({ data: { name: E.dispatch, props: { objectiveId: p.objectiveId, status: "verification_started", type: "checkpoint" } } });
  }
}

type Outcome = { status: "executed" | "queued" | "failed"; detail: string; extra?: Record<string, unknown> };
async function execute(db: Db, p: PlannedAction, now: Date): Promise<Outcome> {
  const a: DispatchAction = p.action;
  try {
    switch (a.type) {
      case "start_experiment": await defineExperiment(db as never, a.def as ExperimentDef); return { status: "executed", detail: `experiment ${a.def.key} started` };
      case "stop_experiment": await concludeExperiment(db as never, a.key, a.winnerId, a.evidence); return { status: "executed", detail: `experiment ${a.key} concluded` };
      case "set_flag": {
        const prev = (await db.adsFeatureFlag.findUnique({ where: { key: a.key } }))?.enabled ?? null;
        await db.adsFeatureFlag.upsert({ where: { key: a.key }, create: { key: a.key, enabled: a.enabled }, update: { enabled: a.enabled } });
        return { status: "executed", detail: `${a.key}: ${prev} -> ${a.enabled}`, extra: { previous: prev } };
      }
      case "optimizer_run_request": await db.adsEvent.create({ data: { name: "optimizer_run_request", props: { focus: a.focus, reason: a.reason, source: "exec", objectiveId: p.objectiveId } } }); return { status: "queued", detail: "optimizer run requested (runs only if sys_optimizer is on)" };
      case "proposal": await db.adsEvent.create({ data: { name: a.proposalKind, props: { source: "exec", status: "proposed", title: a.title, rationale: a.rationale, objectiveId: p.objectiveId } } }); return { status: "queued", detail: `${a.proposalKind} filed for owner review` };
      case "owner_decision": await db.adsEvent.create({ data: { name: E.owner, props: { status: "open", question: a.question, options: a.options, recommended: a.recommended, recommendedLabel: a.options.find((o) => o.id === a.recommended)?.label ?? a.recommended, why: a.why, objectiveId: p.objectiveId } } }); return { status: "queued", detail: "owner decision item created" };
      case "evidence_task": await db.adsEvent.create({ data: { name: "exec_evidence_task", props: { templateId: a.templateId, note: a.note, status: "queued", objectiveId: p.objectiveId } } }); return { status: "queued", detail: "evidence task queued (uses an owner-approved template; sending goes through the existing founder-ask path and contact guard)" };
      case "checkpoint": return { status: "executed", detail: `checkpoint on ${a.metric}`, extra: { metric: a.metric, dueAt: new Date(now.getTime() + a.dueInDays * 86_400_000).toISOString(), question: a.question, baseline: await baseline(db, a.metric) } };
      case "build_request": await db.adsEvent.create({ data: { name: E.build, props: { status: "pending", title: a.title, kind: a.kind, spec: a.spec, acceptance: a.acceptance, objectiveId: p.objectiveId, createdBy: "exec-coordinator" } } }); return { status: "queued", detail: "build_request queued for the human/coordinator (never executed autonomously)" };
    }
  } catch (e) { return { status: "failed", detail: errMsg(e) }; }
}

async function baseline(db: Db, metric: string): Promise<number | null> {
  const map: Record<string, string> = { signups: "signed_up", sign_ups: "signed_up", free_packs_finished: "first_ad_ready", unlocks: "purchased" };
  const name = map[metric];
  if (!name) return null;
  return db.adsEvent.count({ where: { name, ...(name === "purchased" ? {} : { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }) } }).catch(() => null);
}

async function opportunityPass(d: ExecDeps, stage: Parameters<typeof allowedStrategiesFor>[0], constraint: string | null, write: (n: string, p: unknown) => Promise<void>, week: string) {
  const db = d.db, env = d.env ?? process.env;
  const [offers, kly] = await Promise.all([
    db.adsEvent.findMany({ where: { name: "offer_proposal" }, orderBy: { createdAt: "desc" }, take: 8, select: { props: true } }).catch(() => []),
    db.klyDaily.findMany({ where: { day: { gte: new Date(Date.now() - 30 * 86_400_000) } }, select: { sent: true, replies: true, positive: true, signups: true, paid: true } }).catch(() => []),
  ]);
  const sum = (k: "sent" | "replies" | "positive" | "signups" | "paid") => kly.reduce((a, r) => a + r[k], 0);
  const objections = offers.map((o) => String((o.props as { title?: string; hypothesis?: string })?.title ?? (o.props as { hypothesis?: string })?.hypothesis ?? "")).filter(Boolean);
  const replyLines: string[] = []; // no producer classifies replies into AdsEvents; kly reply COUNTS are in channelResults below
  const channel = kly.length ? [`Cold email 30d: ${sum("sent")} sent, ${sum("replies")} replies, ${sum("positive")} positive, ${sum("signups")} sign-ups, ${sum("paid")} paid`] : [];
  if (!objections.length && !replyLines.length && !channel.length) return; // no evidence, no opportunities
  let calls = 0;
  const provider = d.provider ?? (() => { try { return createProvider("codex", { ...env, TEXT_BRAIN: "codex" }, { db, by: "engine" }); } catch { return null; } })();
  if (!provider) return;
  const prompt = buildOpportunityPrompt({ stage, constraint, objections, replies: replyLines, competitors: [], channelResults: channel, segments: [], allowedStrategies: allowedStrategiesFor(stage) });
  for (let attempt = 0; attempt < 2 && calls < EXEC_AUTHORITY.execAiCallsPerWeek; attempt++) {
    calls++;
    try {
      const r = await provider.text({ system: OPPORTUNITY_SYSTEM, prompt, jsonSchema: OPPORTUNITY_SCHEMA as unknown as Record<string, unknown>, reasoning: "medium" });
      const opps = parseOpportunities(r.json ?? r.text);
      if (!opps.length && attempt === 0 && !(r.json && (r.json as { opportunities?: unknown[] }).opportunities)) continue;
      const biggerConstraint = Boolean(constraint) && stage !== "scaling";
      for (const jo of judgeOpportunities(opps, { stage, constraintIsBigger: biggerConstraint, constraint })) await write("exec_opportunity", { week, status: jo.status, label: jo.label, reason: jo.reason, score: jo.score.score, adjustments: jo.score.adjustments, ...jo.opp });
      await write("ai_call", { system: "exec_coordinator", calls });
      return;
    } catch (e) { log("warn", "exec opportunity pass failed", { error: errMsg(e) }); }
  }
}

export function startExecLoop(opts: { db: Db; send?: SendMail; env?: NodeJS.ProcessEnv }): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await execTick({ db: opts.db, send: opts.send, env: opts.env }); } catch { /* logged in execTick */ } finally { busy = false; }
  };
  const first = setTimeout(() => void tick(), 150_000);
  const timer = setInterval(() => void tick(), 6 * 3_600_000);
  return () => { clearTimeout(first); clearInterval(timer); };
}

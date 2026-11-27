// The executive strategy cycle (pure orchestration; all I/O via injected deps and the AdsEvent store):
// governance -> overrides -> idempotency -> context -> stage -> constraint -> objectives -> decisions -> reviews -> handoff -> summary.
// Each step is isolated (one failing step is recorded, the rest run). Budget: at most `maxCalls` AI calls. Dry run writes nothing.
import { stageIndexOf, stageOf } from "./validation-mode";
import { isoWeekKey } from "../optimizer/actions";
import { buildBusinessContext, constraintInputsOf, type ContextInput } from "./context";
import { applyRootCauseNotes, diagnoseExecConstraints, ROOT_CAUSE_SCHEMA, type ConstraintReport } from "./constraints17";
import { decideAuthority, decisionId, decisionQuality, isReviewDue, parseDecision, reviewDecision, validateDecision, type Actual, type DecisionReview, type ExecDecision } from "./decisions";
import { assertAgentMayWrite, EXEC_EVENTS, foldOverrides, governanceSelfCheck, isBlockedByOverride, nextAudit, type AuditRecord, type GovernanceCheck } from "./governance";
import { approvalFor, buildPortfolio, foldObjectives, OBJECTIVES_JSON_SCHEMA, parseObjective, type ObjectiveSpec } from "./objectives";
import { allowedStrategies } from "./stage";
import { asObj, type ExecDb } from "./types";

export const DEFAULT_MAX_CALLS = 10;
export interface AskReq { system: string; prompt: string; schema: Record<string, unknown> }
export interface CycleDeps {
  db: ExecDb; now: Date; forced: boolean; dryRun: boolean; maxCalls: number; emergencyStopActive: boolean;
  gather: () => Promise<ContextInput>;
  ask: (r: AskReq) => Promise<unknown>;
  measure?: (d: ExecDecision) => Promise<Actual | null>;
}
export interface CycleResult { status: "ok" | "skipped" | "halted" | "paused_by_owner" | "failed"; week: string; calls: number; stepErrors: Record<string, string>; objectives: number; rejected: number; holdForced: boolean; primary: string | null; notes: string[]; governance?: GovernanceCheck }

const OBJ_EVENTS = [EXEC_EVENTS.objective, EXEC_EVENTS.objectiveStatus];
const read = (db: ExecDb, names: string[], take: number, order: "asc" | "desc" = "asc") => db.adsEvent.findMany({ where: { name: { in: names } }, orderBy: { createdAt: order }, take }) as Promise<Array<{ id?: string; name: string; props: unknown; createdAt?: Date }>>;

export async function runExecCycle(d: CycleDeps): Promise<CycleResult> {
  const week = isoWeekKey(d.now);
  const res: CycleResult = { status: "ok", week, calls: 0, stepErrors: {}, objectives: 0, rejected: 0, holdForced: false, primary: null, notes: [] };
  let lastAudit: AuditRecord | null = null;
  const emit = async (name: string, props: Record<string, unknown>) => {
    assertAgentMayWrite(name);
    if (d.dryRun) { res.notes.push(`dry-run: would write ${name}`); return; }
    const row = await d.db.adsEvent.create({ data: { name, props } });
    lastAudit = nextAudit(lastAudit, name, { id: row?.id ?? null, summary: String(props.title ?? props.question ?? props.status ?? props.week ?? "") }, d.now);
    await d.db.adsEvent.create({ data: { name: EXEC_EVENTS.audit, props: lastAudit as unknown as Record<string, unknown> } });
  };
  const step = async (name: string, fn: () => Promise<void>) => { try { await fn(); } catch (e) { res.stepErrors[name] = e instanceof Error ? e.message : String(e); } };
  const ask = async (r: AskReq) => { if (res.calls >= d.maxCalls) return null; res.calls++; return d.ask(r); };
  const fail = async () => { res.status = "failed"; await emit(EXEC_EVENTS.cycle, { week, ok: false, status: "failed", stepErrors: res.stepErrors, at: d.now.toISOString() }).catch(() => undefined); return res; };

  // 1. governance + owner overrides (fail closed)
  const chain = (await read(d.db, [EXEC_EVENTS.audit], 5000)).map((r) => r.props as AuditRecord);
  lastAudit = chain.length ? chain[chain.length - 1] ?? null : null;
  res.governance = governanceSelfCheck({ auditRecords: chain, emergencyStopActive: d.emergencyStopActive });
  if (!res.governance.ok) {
    res.status = "halted"; res.notes.push(...res.governance.problems);
    // a broken audit chain cannot be extended; only record when the chain itself is intact
    if (!res.governance.problems.some((p) => p.includes("audit"))) await emit(EXEC_EVENTS.cycle, { week, ok: false, status: "halted", problems: res.governance.problems, at: d.now.toISOString() }).catch(() => undefined);
    return res;
  }
  const overrides = foldOverrides(await read(d.db, [EXEC_EVENTS.override], 500));
  if (overrides.pausedAll) { res.status = "paused_by_owner"; await emit(EXEC_EVENTS.cycle, { week, ok: true, status: "paused_by_owner", at: d.now.toISOString() }).catch(() => undefined); return res; }

  // 2. idempotency per ISO week
  const prior = (await read(d.db, [EXEC_EVENTS.cycle], 20, "desc")).find((r) => asObj(r.props).week === week && asObj(r.props).ok === true && asObj(r.props).status === "ok");
  if (prior && !d.forced) { res.status = "skipped"; res.notes.push(`week ${week} already ran`); return res; }

  // 3. context
  let input: ContextInput | null = null;
  await step("context", async () => { input = await d.gather(); await emit(EXEC_EVENTS.context, { ...buildBusinessContext(input), week }); });
  const g = input as ContextInput | null;
  if (!g) return fail();

  // 4. stage + constraint
  // ONE stage definition shared with the coordinator (validation-mode.stageOf): the stricter of the revenue snapshot's roadmap stage and the paying-customer stage.
  const snapStage = g.snapshot?.stage ?? { index: 0, label: "Pre-revenue (no snapshot: strictest stage assumed)", code: "improvise" };
  const execIdx = stageIndexOf(stageOf({ payingCustomers: g.snapshot?.economics?.payingCustomers ?? 0, mrrCents: null }));
  const stage = { ...snapStage, index: Math.min(snapStage.index, execIdx) };
  let report: ConstraintReport | null = null;
  await step("constraint", async () => {
    let rep = diagnoseExecConstraints(constraintInputsOf(g));
    const evidenced = rep.results.filter((r) => r.status === "evidenced");
    if (evidenced.length) {
      const raw = await ask({ system: "You summarise root causes for a small business strategy engine. Use ONLY the evidence given. Never state a cause as proven unless the evidence says so. Do not choose the primary constraint.", prompt: JSON.stringify({ stage: stage.label, constraints: evidenced.map((r) => ({ id: r.id, evidence: r.evidence.map((e) => e.text), ruleRootCause: r.rootCause })) }), schema: ROOT_CAUSE_SCHEMA as unknown as Record<string, unknown> }).catch(() => null);
      if (raw) rep = applyRootCauseNotes(rep, raw);
    }
    report = rep; res.primary = rep.primary.id;
  });
  const rep = report as ConstraintReport | null;
  if (!rep) return fail();

  // 5. objectives (AI proposes, rules decide; hold_and_measure when evidence is thin)
  const states = foldObjectives(await read(d.db, OBJ_EVENTS, 2000));
  const accepted: ObjectiveSpec[] = [];
  await step("objectives", async () => {
    const raw = await ask({
      system: "You are the strategy engine of a pre-revenue SaaS. Propose at most 3 outcome-oriented objectives. Rules: default to hold_and_measure when evidence is thin; propose build ONLY for a measured primary constraint and cite its evidence; never prescribe implementation; spend 0; never touch prices, caps, billing or legal; use only allowed strategies; cite evidence with levels (measured|inferred|assumed) and never invent event ids.",
      prompt: JSON.stringify({ stage: stage.label, allowedStrategies: allowedStrategies(stage.index), primary: rep.primary, constraints: rep.results.map((r) => ({ id: r.id, status: r.status, level: r.level, n: r.n, evidence: r.evidence.map((e) => e.text) })), ownerPriority: overrides.redirect, openObjectives: [...states.values()].filter((s) => ["proposed", "approved", "active", "verifying"].includes(s.status)).map((s) => s.spec.title) }),
      schema: OBJECTIVES_JSON_SCHEMA as unknown as Record<string, unknown>,
    }).catch((e) => { res.notes.push(`objective AI unavailable: ${e instanceof Error ? e.message : String(e)}`); return null; });
    const list = asObj(raw).objectives;
    const proposals = (Array.isArray(list) ? list : []).map((o) => parseObjective(o, week)).filter((o): o is ObjectiveSpec => !!o);
    const existing = { objectives: [...states.values()].map((s) => ({ id: s.spec.id, title: s.spec.title, status: s.status })), experiments: g.experiments.map((e) => ({ key: e.key, hypothesis: e.hypothesis })), hypotheses: g.hypotheses };
    const pf = buildPortfolio(proposals, { stageIndex: stage.index, report: rep, existing }, week, stage.label);
    res.rejected = pf.rejected.length; res.holdForced = pf.holdForced;
    for (const v of pf.accepted) {
      if (states.has(v.spec.id) || isBlockedByOverride(overrides, v.spec.id)) continue;
      const approval = approvalFor(v.spec);
      await emit(EXEC_EVENTS.objective, { spec: v.spec, status: approval === "auto_approved" ? "approved" : "proposed", approval, week, title: v.spec.title });
      accepted.push(v.spec); res.objectives++;
    }
    res.notes.push(...pf.rejected.slice(0, 5).map((v) => `rejected "${v.spec.title}": ${v.reasons.join("; ")}`));
  });

  // 6. decision records for new objectives
  await step("decisions", async () => {
    for (const spec of accepted) {
      const at = d.now.toISOString(), first = spec.acceptance[0];
      const dec: ExecDecision = {
        id: decisionId(spec.title, at), question: `What is the right next move on "${spec.constraintId ?? "the evidence gap"}" this week?`,
        alternatives: [
          { option: spec.title, pros: [spec.outcome], cons: spec.risks.slice(0, 2) },
          { option: "Start new build work now", pros: ["Visible progress"], cons: ["No demonstrated constraint justifies it", "Opportunity cost"] },
          { option: "Stop measuring and do nothing", pros: ["Zero effort"], cons: ["No new evidence; the constraint stays unknown"] },
        ],
        chosen: spec.title, reasoning: spec.justification, evidence: spec.evidence,
        uncertainty: rep.primary.confidence === "high" ? "Medium: rates are measured but benchmarks are assumptions." : "High: small samples; the chosen path is intentionally low-commitment.",
        reversibility: spec.authority.reversible ? "reversible" : "costly",
        expected: first && first.comparator !== "observed" && first.target !== null ? { metric: first.metric, comparator: first.comparator, target: first.target, windowDays: first.windowDays } : null,
        expectedOutcome: spec.outcome, assumptions: spec.evidence.filter((e) => e.level === "assumed").map((e) => e.text).slice(0, 4),
        reviewDate: new Date(d.now.getTime() + 30 * 86_400_000).toISOString(),
        boundaries: [...(spec.type === "build" ? (["product_change"] as const) : []), ...(spec.authority.spendCents > 0 ? (["financial"] as const) : [])], spendCents: spec.authority.spendCents, objectiveId: spec.id,
      };
      const problems = validateDecision(dec);
      if (problems.length) { res.notes.push(`decision for ${spec.id} invalid: ${problems.join("; ")}`); continue; }
      dec.authority = decideAuthority(dec).level;
      await emit(EXEC_EVENTS.decision, { ...dec });
    }
  });

  // 7. outcome reviews of due decisions (executive learning loop)
  await step("reviews", async () => {
    const decs = (await read(d.db, [EXEC_EVENTS.decision], 500)).flatMap((r) => { const p = parseDecision(r.props); return p ? [p] : []; });
    const done = new Set((await read(d.db, [EXEC_EVENTS.review], 1000)).map((r) => String(asObj(r.props).decisionId)));
    for (const dec of decs) {
      if (done.has(dec.id) || !isReviewDue(dec, d.now)) continue;
      const rv: DecisionReview = reviewDecision(dec, d.measure ? await d.measure(dec).catch(() => null) : null, d.now);
      await emit(EXEC_EVENTS.review, { ...rv, title: dec.question });
    }
  });

  // 8. summary + handoff list (part 2 reads loadActiveObjectives)
  const final = foldObjectives(await read(d.db, OBJ_EVENTS, 2000));
  const handoff = [...final.values()].filter((s) => (s.approval === "auto_approved" || s.approval === "owner_approved") && (s.status === "approved" || s.status === "active") && !isBlockedByOverride(overrides, s.spec.id)).map((s) => s.spec.id);
  const reviews = (await read(d.db, [EXEC_EVENTS.review], 500)).map((r) => r.props as DecisionReview);
  const ok = Object.keys(res.stepErrors).length === 0;
  res.status = ok ? "ok" : "failed";
  await emit(EXEC_EVENTS.cycle, { week, ok, status: res.status, stage: stage.code, primary: rep.primary, mode: rep.sampleBelowThreshold ? "hold_and_measure" : "evidence_based", holdForced: res.holdForced, newObjectives: res.objectives, rejected: res.rejected, handoff, calls: res.calls, dryRun: d.dryRun, stepErrors: res.stepErrors, decisionQuality: decisionQuality(reviews), notes: res.notes.slice(0, 10), at: d.now.toISOString() }).catch(() => undefined);
  return res;
}

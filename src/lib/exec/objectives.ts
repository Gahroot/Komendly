// Strategic objectives: outcome-oriented spec, strict JSON schema for Codex, rule validator, hold_and_measure hard rule,
// approval classification, and the fold of exec_objective / exec_objective_status events into current state. Pure TS.
import { ACTION_TYPES } from "../optimizer/actions";
import type { ConstraintReport } from "./constraints17";
import { MIN_MEASURED_N } from "./constraints17";
import { EXEC_EVENTS } from "./governance";
import { isStrategyAllowed, STRATEGIES, type Strategy } from "./stage";
import { FNV, asObj, type ExecDb, type ApprovalState, type EvidenceItem, type ObjectiveStatus, type ObjectiveType } from "./types";

export const MAX_ACTIVE_OBJECTIVES = 3;
export const OBJECTIVE_TYPES = ["hold_and_measure", "evidence_gathering", "experiment", "build", "operate"] as const satisfies readonly ObjectiveType[];
const OPEN: ObjectiveStatus[] = ["proposed", "approved", "active", "verifying"];
/** Actions an auto-approved objective may rely on: the optimiser allow-list minus owner_decision, plus passive ones. */
export const AUTO_ACTIONS: readonly string[] = [...ACTION_TYPES.filter((a) => a !== "owner_decision"), "observe", "report", "run_existing_channels", "ask_customers", "ask_owner"];

export interface Criterion { metric: string; comparator: ">=" | "<=" | "=" | "observed"; target: number | null; windowDays: number }
export interface ObjectiveSpec {
  id: string; title: string; justification: string; outcome: string; type: ObjectiveType; strategy: Strategy; constraintId: string | null;
  evidence: EvidenceItem[]; acceptance: Criterion[];
  authority: { spendCents: number; reversible: boolean; actions: string[] };
  dependencies: string[]; risks: string[]; verification: string[]; reassessWhen: string[];
}
export interface ObjectiveState { spec: ObjectiveSpec; status: ObjectiveStatus; approval: ApprovalState; week: string; createdEventId?: string; evidenceLog: unknown[]; updatedAt?: string }

const str = (n: number) => ({ type: "string", maxLength: n });
const strs = (max: number) => ({ type: "array", maxItems: max, items: str(300) });
export const OBJECTIVES_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["objectives"],
  properties: { objectives: { type: "array", maxItems: MAX_ACTIVE_OBJECTIVES, items: {
    type: "object", additionalProperties: false,
    required: ["title", "justification", "outcome", "type", "strategy", "constraintId", "evidence", "acceptance", "authority", "dependencies", "risks", "verification", "reassessWhen"],
    properties: {
      title: str(120), justification: str(600), outcome: str(400), type: { type: "string", enum: [...OBJECTIVE_TYPES] }, strategy: { type: "string", enum: [...STRATEGIES] }, constraintId: { type: ["string", "null"] },
      evidence: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false, required: ["level", "text", "eventId"], properties: { level: { type: "string", enum: ["measured", "inferred", "assumed"] }, text: str(300), eventId: { type: ["string", "null"] } } } },
      acceptance: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false, required: ["metric", "comparator", "target", "windowDays"], properties: { metric: str(120), comparator: { type: "string", enum: [">=", "<=", "=", "observed"] }, target: { type: ["number", "null"] }, windowDays: { type: "number" } } } },
      authority: { type: "object", additionalProperties: false, required: ["spendCents", "reversible", "actions"], properties: { spendCents: { type: "number" }, reversible: { type: "boolean" }, actions: strs(8) } },
      dependencies: strs(5), risks: strs(5), verification: strs(5), reassessWhen: strs(5),
    } } } },
} as const;

export function objectiveId(week: string, title: string): string { return `obj-${week}-${FNV(title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()).slice(0, 8)}`; }

/** Normalise raw (Codex) objective output; returns null when structurally invalid. Ids are assigned by us, never the model. */
export function parseObjective(raw: unknown, week: string): ObjectiveSpec | null {
  const o = asObj(raw);
  const s = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 300)) : []);
  const title = s(o.title, 120), type = o.type as ObjectiveType, strategy = o.strategy as Strategy;
  if (!title || !OBJECTIVE_TYPES.includes(type) || !STRATEGIES.includes(strategy)) return null;
  const a = asObj(o.authority);
  const evidence = (Array.isArray(o.evidence) ? o.evidence : []).flatMap((e): EvidenceItem[] => { const x = asObj(e); const text = s(x.text, 300); const level = x.level; return text && (level === "measured" || level === "inferred" || level === "assumed") ? [{ level, text, eventId: typeof x.eventId === "string" && x.eventId ? x.eventId : undefined }] : []; });
  const acceptance = (Array.isArray(o.acceptance) ? o.acceptance : []).flatMap((c): Criterion[] => { const x = asObj(c); const metric = s(x.metric, 120); const cmp = x.comparator; return metric && (cmp === ">=" || cmp === "<=" || cmp === "=" || cmp === "observed") ? [{ metric, comparator: cmp, target: typeof x.target === "number" && Number.isFinite(x.target) ? x.target : null, windowDays: typeof x.windowDays === "number" && x.windowDays > 0 ? Math.min(x.windowDays, 365) : 30 }] : []; });
  return {
    id: objectiveId(week, title), title, justification: s(o.justification), outcome: s(o.outcome, 400), type, strategy, constraintId: typeof o.constraintId === "string" ? o.constraintId : null, evidence, acceptance,
    authority: { spendCents: typeof a.spendCents === "number" && Number.isFinite(a.spendCents) ? Math.max(0, Math.round(a.spendCents)) : Number.POSITIVE_INFINITY, reversible: a.reversible === true, actions: arr(a.actions) },
    dependencies: arr(o.dependencies), risks: arr(o.risks), verification: arr(o.verification), reassessWhen: arr(o.reassessWhen),
  };
}

/** Prescribing HOW (code, schema, libraries, files) instead of WHAT outcome. */
const IMPLEMENTATION = /\b(refactor|implement(?:ing)? (?:a|an|the)|add (?:a |an |the )?(?:column|table|endpoint|function|component|migration|index)|write (?:a |the )?(?:function|component|script|migration)|use (?:react|prisma|postgres|redis|zod|next\.?js|tailwind)|src\/|\.tsx?\b|api\/|sql\b|regex|cron expression|npm install)/i;
const FORBIDDEN_TOUCH = /\b(stripe price|change (?:the )?price|price (?:increase|cut|change)|spend cap|raise (?:the )?(?:budget|cap)|privacy policy|terms of service|legal|contract|authority matrix|exec_override|own authority|raise (?:its|our) autonomy)\b/i;

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3));
export function similarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let i = 0; for (const t of x) if (y.has(t)) i++;
  return i / (x.size + y.size - i);
}
export interface ExistingWork { objectives: Array<{ id: string; title: string; status: ObjectiveStatus }>; experiments: Array<{ key: string; hypothesis?: string }>; hypotheses: Array<{ text: string }> }
export interface ValidationContext { stageIndex: number; report: ConstraintReport; existing: ExistingWork; ownerAuthorizedSpendCents?: number }
export interface ObjectiveVerdict { spec: ObjectiveSpec; ok: boolean; reasons: string[] }

export function validateObjective(spec: ObjectiveSpec, ctx: ValidationContext): ObjectiveVerdict {
  const r: string[] = [];
  const text = [spec.title, spec.outcome, spec.justification, ...spec.acceptance.map((c) => c.metric)].join(" | ");
  if (IMPLEMENTATION.test(text)) r.push("prescribes implementation details (specify the outcome, not the how)");
  if (FORBIDDEN_TOUCH.test(text) || spec.authority.actions.some((a) => FORBIDDEN_TOUCH.test(a))) r.push("touches a forbidden area (prices, caps, legal, governance)");
  if (!spec.outcome || !spec.justification) r.push("missing outcome or business justification");
  if (!spec.evidence.length || spec.evidence.every((e) => !e.text)) r.push("no supporting evidence");
  if (!spec.acceptance.length) r.push("no measurable acceptance criteria");
  if (!spec.verification.length) r.push("no verification requirement");
  if (!spec.reassessWhen.length) r.push("no reassessment condition");
  if (!isStrategyAllowed(ctx.stageIndex, spec.strategy)) r.push(`strategy "${spec.strategy}" is not appropriate at stage ${ctx.stageIndex}`);
  if (spec.type === "hold_and_measure" && spec.strategy !== "hold_and_measure" && spec.strategy !== "operate_existing_channels") r.push("hold_and_measure must use the hold_and_measure strategy");
  if (!Number.isFinite(spec.authority.spendCents)) r.push("spend not stated");
  else if (spec.authority.spendCents > (ctx.ownerAuthorizedSpendCents ?? 0)) r.push(`spend ${spec.authority.spendCents}c exceeds authority (spend is 0 unless owner-authorized)`);
  // evidence-gated types
  const c = ctx.report.results.find((x) => x.id === spec.constraintId);
  if (spec.type === "build") {
    if (!c || c.status !== "evidenced" || c.level !== "measured") r.push(`build requires a demonstrated constraint with measured evidence (${MIN_MEASURED_N}+ observations)`);
    else if (ctx.report.primary.id !== c.id) r.push("build must target the primary constraint");
    else if (!spec.evidence.some((e) => e.level === "measured" && (e.constraintId === c.id || /revenue_snapshot|exec_context/.test(e.eventId ?? "")))) r.push("build must cite the measured evidence for its constraint");
  }
  if (spec.type === "experiment" && (!c || c.status !== "evidenced")) r.push("experiment requires an evidenced constraint it targets");
  if ((spec.type === "build" || spec.type === "experiment") && ctx.report.sampleBelowThreshold && spec.type === "build") r.push("sample sizes below threshold: hold_and_measure applies");
  if (spec.type !== "hold_and_measure" && spec.type !== "evidence_gathering" && spec.evidence.every((e) => e.level === "assumed")) r.push("only assumed evidence: cannot justify action beyond measuring");
  // duplicates
  for (const o of ctx.existing.objectives) if (OPEN.includes(o.status) && (o.id === spec.id || similarity(o.title, spec.title) >= 0.6)) r.push(`duplicates existing objective ${o.id}`);
  for (const e of ctx.existing.experiments) if (e.hypothesis && similarity(e.hypothesis, `${spec.title} ${spec.outcome}`) >= 0.6) r.push(`duplicates experiment ${e.key}`);
  for (const h of ctx.existing.hypotheses) if (similarity(h.text, `${spec.title} ${spec.outcome}`) >= 0.6) r.push("duplicates a recorded hypothesis");
  return { spec, ok: r.length === 0, reasons: r };
}

/** Auto-approval only for reversible, zero-spend, in-bounds hold/evidence/experiment objectives. Everything else needs the owner. */
export function approvalFor(spec: ObjectiveSpec): ApprovalState {
  const kinds: ObjectiveType[] = ["hold_and_measure", "evidence_gathering", "experiment"];
  const inBounds = spec.authority.actions.every((a) => AUTO_ACTIONS.includes(a));
  return kinds.includes(spec.type) && spec.authority.spendCents === 0 && spec.authority.reversible && inBounds ? "auto_approved" : "needs_owner";
}

/** Deterministic hold_and_measure objective (no AI). Cites the report's own insufficient-evidence items. */
export function holdAndMeasureObjective(week: string, report: ConstraintReport, stageLabel: string): ObjectiveSpec {
  const need = report.results.filter((r) => r.status === "insufficient_evidence").slice(0, 4);
  const title = "Keep operating current channels and gather evidence";
  return {
    id: objectiveId(week, title), title,
    justification: `Evidence is below threshold (${report.primary.reason}). At "${stageLabel}" the correct move is to keep existing systems running and measure, not to start new work.`,
    outcome: "Enough observations per funnel step to name the real constraint, and direct answers from customers on why they do or do not buy.",
    type: "hold_and_measure", strategy: "hold_and_measure", constraintId: null,
    evidence: [{ level: "assumed", text: report.primary.reason, eventId: "exec_context" }, ...need.map((n) => ({ level: "assumed" as const, text: `${n.label}: ${n.evidence[0]?.text ?? "no data"}`, constraintId: n.id }))],
    acceptance: [{ metric: "funnel steps with 30+ observations", comparator: ">=", target: 3, windowDays: 30 }, { metric: "customer answers to why-not-buy", comparator: ">=", target: 10, windowDays: 30 }],
    authority: { spendCents: 0, reversible: true, actions: ["observe", "report", "run_existing_channels", "ask_customers"] },
    dependencies: [], risks: ["Opportunity cost: a real constraint may exist that small samples hide."], verification: ["Re-run the constraint diagnosis and confirm sample sizes rose."],
    reassessWhen: ["Any funnel step reaches 30 observations", "The first customer pays", "A customer reply names a specific blocker"],
  };
}

export interface PortfolioResult { accepted: ObjectiveVerdict[]; rejected: ObjectiveVerdict[]; holdForced: boolean }
/**
 * HARD RULE. Below evidence thresholds the portfolio is hold_and_measure (+ evidence_gathering/operate), never build/experiment.
 * Valid proposals are capped to MAX_ACTIVE_OBJECTIVES counting the objectives already open. If nothing valid remains, hold_and_measure is emitted.
 */
export function buildPortfolio(proposals: readonly ObjectiveSpec[], ctx: ValidationContext, week: string, stageLabel: string): PortfolioResult {
  const verdicts = proposals.map((p) => validateObjective(p, ctx));
  const accepted: ObjectiveVerdict[] = [], rejected: ObjectiveVerdict[] = [];
  const hold = ctx.report.sampleBelowThreshold;
  const room = Math.max(0, MAX_ACTIVE_OBJECTIVES - ctx.existing.objectives.filter((o) => OPEN.includes(o.status)).length);
  for (const v of verdicts) {
    if (hold && (v.spec.type === "build" || v.spec.type === "experiment") && v.ok) { rejected.push({ ...v, ok: false, reasons: ["sample sizes below threshold: only hold_and_measure / evidence_gathering allowed"] }); continue; }
    if (v.ok && accepted.length < room) accepted.push(v); else rejected.push(v.ok ? { ...v, ok: false, reasons: [`portfolio full (max ${MAX_ACTIVE_OBJECTIVES} open objectives)`] } : v);
  }
  let holdForced = false;
  const hasOpenHold = ctx.existing.objectives.some((o) => OPEN.includes(o.status) && /gather evidence/i.test(o.title));
  if (!accepted.length && !ctx.existing.objectives.some((o) => OPEN.includes(o.status)) && !hasOpenHold) {
    const h = holdAndMeasureObjective(week, ctx.report, stageLabel);
    accepted.push({ spec: h, ok: true, reasons: [] }); holdForced = true;
  }
  return { accepted, rejected, holdForced };
}

// ---------- store fold ----------
export interface RawEvent { id?: string; name: string; props: unknown; createdAt?: Date | string }
/** Fold exec_objective + exec_objective_status events (oldest first) into current objective state. */
export function foldObjectives(events: readonly RawEvent[]): Map<string, ObjectiveState> {
  const m = new Map<string, ObjectiveState>();
  for (const e of events) {
    const p = asObj(e.props);
    const at = e.createdAt ? new Date(e.createdAt).toISOString() : undefined;
    if (e.name === EXEC_EVENTS.objective) {
      const spec = p.spec as ObjectiveSpec | undefined;
      if (!spec?.id || m.has(spec.id)) continue;
      m.set(spec.id, { spec, status: (p.status as ObjectiveStatus) ?? "proposed", approval: (p.approval as ApprovalState) ?? "needs_owner", week: String(p.week ?? ""), createdEventId: e.id, evidenceLog: [], updatedAt: at });
    } else if (e.name === EXEC_EVENTS.objectiveStatus) {
      const s = m.get(String(p.objectiveId));
      if (!s) continue;
      if (typeof p.status === "string") s.status = p.status as ObjectiveStatus;
      if (typeof p.approval === "string") s.approval = p.approval as ApprovalState;
      if (p.evidence !== undefined) s.evidenceLog.push(p.evidence);
      s.updatedAt = at;
    }
  }
  return m;
}
export const isHandoffReady = (s: ObjectiveState) => (s.approval === "auto_approved" || s.approval === "owner_approved") && (s.status === "approved" || s.status === "active");

// ---------- DB access for part 2 (execution coordinator) ----------
export async function loadObjectiveStates(db: ExecDb): Promise<Map<string, ObjectiveState>> {
  const rows = await db.adsEvent.findMany({ where: { name: { in: [EXEC_EVENTS.objective, EXEC_EVENTS.objectiveStatus] } }, orderBy: { createdAt: "asc" }, take: 2000 });
  return foldObjectives(rows);
}
/** Objectives part 2 may execute: owner/auto-approved, status approved|active. Overrides (pause/veto) are applied by the caller via foldOverrides. */
export async function loadActiveObjectives(db: ExecDb): Promise<ObjectiveState[]> {
  return [...(await loadObjectiveStates(db)).values()].filter(isHandoffReady);
}
/** Append-only status change (immutable trail). Part 2 reports progress/verification evidence here. */
export async function markObjective(db: ExecDb, id: string, status: ObjectiveStatus, evidence?: unknown, approval?: ApprovalState): Promise<void> {
  await db.adsEvent.create({ data: { name: EXEC_EVENTS.objectiveStatus, props: { objectiveId: id, status, ...(approval ? { approval } : {}), ...(evidence !== undefined ? { evidence } : {}), at: new Date().toISOString() } } });
}

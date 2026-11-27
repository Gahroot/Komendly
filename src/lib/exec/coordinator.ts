// Execution coordinator (pure). Takes ACTIVE approved objectives and turns them into allow-listed, reversible dispatch actions.
// Build work (code) is never executed: it becomes a `build_request` AdsEvent for the human/coordinator (scripts/exec-build-queue.ts).
// Local thin interfaces mirror the strategy engine's `exec_objective` events (status proposed|approved|active|verifying|done|abandoned).
import { conflictingExperiments, type ActiveExperiment } from "../ops/control/coordination";
import { flagChangeAllowed } from "./authority-defaults";
import { type ExecStage, policyFor } from "./validation-mode";

export type ObjectiveStatus = "proposed" | "approved" | "active" | "verifying" | "done" | "abandoned";
export interface ObjectiveLite {
  id: string; title: string; status: ObjectiveStatus; kind?: string; metric?: string; target?: number | null; baseline?: number | null;
  constraint?: string | null; createdAt: string; updatedAt?: string; actions?: unknown[]; approvedBy?: string | null;
}

export type DispatchAction =
  | { type: "start_experiment"; def: { key: string; surface: string; hypothesis: string; metric: string; variants: { id: string; weight: number; payload?: Record<string, unknown> }[]; minPerVariant: number }; kind?: ActiveExperiment["kind"] }
  | { type: "stop_experiment"; key: string; winnerId: string | null; evidence: string }
  | { type: "set_flag"; key: string; enabled: boolean; previous?: boolean | null }
  | { type: "optimizer_run_request"; focus: string; reason: string }
  | { type: "proposal"; proposalKind: "product_proposal" | "offer_proposal"; title: string; rationale: string }
  | { type: "owner_decision"; question: string; options: { id: string; label: string }[]; recommended: string; why: string }
  | { type: "evidence_task"; templateId: string; note: string }
  | { type: "checkpoint"; metric: string; dueInDays: number; question: string }
  | { type: "build_request"; title: string; kind: string; spec: string; acceptance: string[] };

export const DISPATCH_TYPES = ["start_experiment", "stop_experiment", "set_flag", "optimizer_run_request", "proposal", "owner_decision", "evidence_task", "checkpoint", "build_request"] as const;
/** The dispatch event written for every action (accepted, rejected or dry-run). */
export const DISPATCH_EVENT = "exec_dispatch";
export const BUILD_REQUEST_EVENT = "build_request";

export interface DispatchContext {
  stage: ExecStage;
  runningExperiments: ActiveExperiment[];
  /** owner pre-approved evidence templates (AdsEvent `exec_template_approved`). */
  approvedTemplates: string[];
  alreadyDispatched: Set<string>;
  dispatchedThisWeek: Record<string, number>;
  maxPerObjectiveWeek: number;
  now: Date;
}
export interface PlannedAction { objectiveId: string; key: string; action: DispatchAction; reversible: boolean; undo: string }
export interface RejectedAction { objectiveId: string; action: unknown; reason: string }

export const actionKey = (objectiveId: string, a: DispatchAction): string => {
  const core = a.type === "start_experiment" ? a.def.key : a.type === "stop_experiment" ? a.key : a.type === "set_flag" ? `${a.key}=${a.enabled}` : a.type === "evidence_task" ? a.templateId
    : a.type === "checkpoint" ? a.metric : a.type === "owner_decision" ? a.question : a.type === "optimizer_run_request" ? a.focus : a.title;
  return `${objectiveId}:${a.type}:${String(core).toLowerCase().replace(/[^a-z0-9=_]+/g, "-").slice(0, 80)}`;
};

const undoText = (a: DispatchAction): { reversible: boolean; undo: string } => {
  switch (a.type) {
    case "start_experiment": return { reversible: true, undo: `conclude experiment ${a.def.key} (stop_experiment)` };
    case "stop_experiment": return { reversible: true, undo: "re-define the experiment" };
    case "set_flag": return { reversible: true, undo: `set ${a.key} back to ${a.previous === undefined ? "its previous value" : String(a.previous)}` };
    default: return { reversible: true, undo: "informational / queued item; dismiss it" };
  }
};

/** Validate one raw action against the allow-list and policies. Returns the typed action or a rejection reason. */
export function validateAction(raw: unknown, ctx: DispatchContext): { ok: true; action: DispatchAction } | { ok: false; reason: string } {
  const a = raw as Partial<DispatchAction> & Record<string, unknown>;
  if (!a || typeof a !== "object" || !(DISPATCH_TYPES as readonly string[]).includes(String(a.type))) return { ok: false, reason: `action type not allow-listed (${String(a?.type)})` };
  const pol = policyFor(ctx.stage);
  switch (a.type) {
    case "set_flag": {
      const g = flagChangeAllowed(String(a.key), a.enabled === true);
      return g.ok ? { ok: true, action: a as DispatchAction } : { ok: false, reason: g.reason };
    }
    case "start_experiment": {
      const d = (a as { def?: { key?: string; surface?: string; variants?: unknown[]; minPerVariant?: number } }).def;
      if (!d?.key || !d.surface || !Array.isArray(d.variants) || d.variants.length < 2 || !((d.minPerVariant ?? 0) >= 1)) return { ok: false, reason: "invalid experiment definition" };
      const next: ActiveExperiment = { key: String(d.key), surface: String(d.surface), kind: (a as { kind?: ActiveExperiment["kind"] }).kind ?? "other" };
      if (ctx.runningExperiments.some((e) => e.key === d.key)) return { ok: false, reason: "experiment already running" };
      const clash = conflictingExperiments([...ctx.runningExperiments, next]).find((p) => p.id.includes(String(d.key)));
      return clash ? { ok: false, reason: `conflicts with a running experiment: ${clash.message}` } : { ok: true, action: a as DispatchAction };
    }
    case "stop_experiment":
      return a.key ? { ok: true, action: a as DispatchAction } : { ok: false, reason: "missing experiment key" };
    case "evidence_task":
      return ctx.approvedTemplates.includes(String(a.templateId)) ? { ok: true, action: a as DispatchAction } : { ok: false, reason: "no owner-approved template with that id (exec_template_approved); asking the owner instead" };
    case "build_request": {
      const k = String(a.kind ?? "");
      if (pol.blockedKinds.includes(k)) return { ok: false, reason: `build kind "${k}" is blocked in ${pol.mode}` };
      if (!a.title || !a.spec || !Array.isArray(a.acceptance) || a.acceptance.length === 0) return { ok: false, reason: "build_request needs title, spec and acceptance criteria" };
      return { ok: true, action: a as DispatchAction };
    }
    case "proposal":
      return a.title && a.rationale ? (pol.blockedKinds.includes("new_product") && a.proposalKind === "product_proposal" && ctx.stage === "pre_revenue"
        ? { ok: false, reason: "new product proposals are held in commercial validation mode" } : { ok: true, action: a as DispatchAction }) : { ok: false, reason: "proposal needs title and rationale" };
    case "owner_decision":
      return a.question && Array.isArray(a.options) && a.options.length >= 2 && a.recommended ? { ok: true, action: a as DispatchAction } : { ok: false, reason: "owner_decision needs a question, 2+ options and a recommended option" };
    case "checkpoint":
      return a.metric && Number(a.dueInDays) > 0 ? { ok: true, action: a as DispatchAction } : { ok: false, reason: "checkpoint needs metric and dueInDays" };
    case "optimizer_run_request":
      return a.focus && a.reason ? { ok: true, action: a as DispatchAction } : { ok: false, reason: "optimizer request needs focus and reason" };
  }
  return { ok: false, reason: "unhandled" };
}

/** Plan dispatches for ACTIVE (and approved) objectives only. Idempotent via alreadyDispatched keys; capped per objective per week. */
export function planDispatch(objectives: readonly ObjectiveLite[], ctx: DispatchContext): { planned: PlannedAction[]; rejected: RejectedAction[] } {
  const planned: PlannedAction[] = [], rejected: RejectedAction[] = [];
  const counts = { ...ctx.dispatchedThisWeek };
  const running = [...ctx.runningExperiments];
  for (const o of objectives) {
    if (o.status !== "active" && o.status !== "approved") continue;
    for (const raw of o.actions ?? []) {
      const c: DispatchContext = { ...ctx, runningExperiments: running };
      const v = validateAction(raw, c);
      if (!v.ok) { rejected.push({ objectiveId: o.id, action: raw, reason: v.reason }); continue; }
      const key = actionKey(o.id, v.action);
      if (ctx.alreadyDispatched.has(key) || planned.some((p) => p.key === key)) continue;
      if ((counts[o.id] ?? 0) >= ctx.maxPerObjectiveWeek) { rejected.push({ objectiveId: o.id, action: raw, reason: "weekly dispatch cap for this objective reached" }); continue; }
      counts[o.id] = (counts[o.id] ?? 0) + 1;
      if (v.action.type === "start_experiment") running.push({ key: v.action.def.key, surface: v.action.def.surface, kind: v.action.kind ?? "other" });
      planned.push({ objectiveId: o.id, key, action: v.action, ...undoText(v.action) });
    }
  }
  return { planned, rejected };
}

// ---------- lifecycle tracking + accountability ----------
export type Phase = "identification" | "execution" | "verification" | "commercial_evaluation" | "closed";
/** Each phase has ONE named system accountable for it. */
export const PHASE_OWNER: Record<Phase, string> = {
  identification: "exec-strategy-engine", execution: "exec-coordinator", verification: "exec-performance", commercial_evaluation: "exec-performance (owner decides on money)", closed: "exec-learning",
};
export const phaseOf = (s: ObjectiveStatus): Phase => ({ proposed: "identification", approved: "execution", active: "execution", verifying: "verification", done: "closed", abandoned: "closed" } as const)[s];

export interface TrackFlags { stalled: boolean; abandoned: boolean; duplicateOf: string | null; ageDays: number; daysSinceActivity: number; waitingOn: string }
export const STALL_DAYS = 10, ABANDON_PROPOSED_DAYS = 21;

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3));
export function similarity(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let i = 0; for (const w of x) if (y.has(w)) i++;
  return i / (x.size + y.size - i);
}

export function trackObjectives(objs: readonly ObjectiveLite[], lastActivity: Record<string, string | undefined>, now: Date): Array<ObjectiveLite & { phase: Phase; owner: string } & TrackFlags> {
  const t = now.getTime(), day = 86_400_000;
  const open = objs.filter((o) => o.status !== "done" && o.status !== "abandoned");
  return objs.map((o) => {
    const ageDays = Math.floor((t - new Date(o.createdAt).getTime()) / day);
    const last = lastActivity[o.id] ?? o.updatedAt ?? o.createdAt;
    const idle = Math.floor((t - new Date(last).getTime()) / day);
    const isOpen = open.includes(o);
    const dup = isOpen ? open.find((p) => p.id !== o.id && p.createdAt <= o.createdAt && (p.id < o.id || p.createdAt < o.createdAt) && ((o.metric && p.metric === o.metric && o.kind === p.kind) || similarity(o.title, p.title) >= 0.6)) : undefined;
    const phase = phaseOf(o.status);
    return {
      ...o, phase, owner: PHASE_OWNER[phase], ageDays, daysSinceActivity: idle, duplicateOf: dup?.id ?? null,
      stalled: isOpen && (o.status === "active" || o.status === "verifying") && idle >= STALL_DAYS,
      abandoned: isOpen && o.status === "proposed" && ageDays >= ABANDON_PROPOSED_DAYS,
      waitingOn: o.status === "proposed" ? "owner approval" : o.status === "verifying" ? "measurement checkpoint" : o.status === "active" || o.status === "approved" ? "execution" : "nothing",
    };
  });
}

/** Objectives that pull in opposite directions: same constraint/metric with different strategies, or one starts what another stops. */
export function conflictingObjectives(objs: readonly ObjectiveLite[]): Array<{ a: string; b: string; why: string }> {
  const live = objs.filter((o) => o.status === "active" || o.status === "approved");
  const out: Array<{ a: string; b: string; why: string }> = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const x = live[i]!, y = live[j]!;
    const fl = (o: ObjectiveLite) => (o.actions ?? []).filter((a): a is { type: "set_flag"; key: string; enabled: boolean } => (a as { type?: string })?.type === "set_flag");
    for (const f of fl(x)) for (const g of fl(y)) if (f.key === g.key && f.enabled !== g.enabled) out.push({ a: x.id, b: y.id, why: `opposite settings for ${f.key}` });
    if (x.kind && x.kind === y.kind && x.constraint && x.constraint === y.constraint && x.metric !== y.metric) out.push({ a: x.id, b: y.id, why: `two ${x.kind} initiatives on the same constraint (${x.constraint}); one constraint at a time` });
  }
  return out;
}

/** Build requests become worker briefs. Pure formatter used by scripts/exec-build-queue.ts. */
export function buildBrief(r: { id: string; title: string; kind: string; spec: string; acceptance: string[]; objectiveId?: string }): string {
  return [
    `MISSION: ${r.title}`, `Source: exec build_request ${r.id}${r.objectiveId ? ` for objective ${r.objectiveId}` : ""} (kind: ${r.kind}).`, "",
    "SPEC:", r.spec, "", "ACCEPTANCE CRITERIA:", ...r.acceptance.map((c, i) => `${i + 1}. ${c}`), "",
    "RULES: read CLAUDE.md first; no commits/pushes/deploys; no schema changes; never expand authority or spend; add tests; report files changed and what was verified.",
  ].join("\n");
}

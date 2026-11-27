// The strategic cycle as one pure function: context -> stage -> constraint -> objectives -> dispatch -> verify -> learn -> next objective.
// Used by the engine tick, the dry-run script, the owner page and the e2e test harness. No I/O, no clock reads (now is passed in).
import { allocate, defaultCandidates, type AllocationPlan, type Candidate } from "./allocation";
import { EXEC_AUTHORITY } from "./authority-defaults";
import { buildExecBrief } from "./brief";
import { conflictingObjectives, planDispatch, trackObjectives, type DispatchAction, type ObjectiveLite, type PlannedAction, type RejectedAction } from "./coordinator";
import { evaluateOrganisation, type OrgFacts } from "./org-effectiveness";
import { evaluate, rankInitiatives, type PerfInput, type RankedInitiative } from "./performance";
import { buildRiskRegister, topRisks, type Risk, type RiskFacts } from "./risks";
import { evidenceScoreboard, policyFor, stageOf, type EvidenceFacts, type EvidenceLine, type ExecStage, type StageFacts } from "./validation-mode";
import type { ActiveExperiment } from "../ops/control/coordination";

export interface CycleInput {
  now: Date; weekLabel: string; adminUrl: string;
  stageFacts: StageFacts; evidence: EvidenceFacts;
  constraint: { key: string; label: string; confidence: string; evidence: string } | null; previousConstraint: string | null;
  objectives: ObjectiveLite[];
  observations: Record<string, Pick<PerfInput, "operational" | "commercial" | "cost">>;
  lastActivity: Record<string, string | undefined>;
  running: ActiveExperiment[]; approvedTemplates: string[]; alreadyDispatched: Set<string>; dispatchedThisWeek: Record<string, number>;
  riskFacts: RiskFacts; org: OrgFacts; klySendsWeekly: number; openOwnerItems: Array<{ question: string; recommended: string }>;
}
export interface CycleOutput {
  stage: ExecStage; mode: string; strategy: string; banner: string;
  tracked: ReturnType<typeof trackObjectives>; conflicts: ReturnType<typeof conflictingObjectives>;
  planned: PlannedAction[]; rejected: RejectedAction[];
  performance: RankedInitiative[]; learned: string[]; allocation: AllocationPlan; risks: Risk[];
  org: ReturnType<typeof evaluateOrganisation>; scoreboard: EvidenceLine[]; nextObjective: ObjectiveLite | null;
  brief: ReturnType<typeof buildExecBrief>; spendCents: 0;
}

/** Fallback next objective when no live objective exists. Evidence-gathering only, reversible, zero spend: safe to auto-approve. */
export function defaultObjectiveFor(stage: ExecStage, constraint: CycleInput["constraint"], now: Date, n: number): ObjectiveLite {
  const pol = policyFor(stage);
  const title = stage === "pre_revenue" ? "Hold and measure: run existing channels and gather buyer evidence"
    : stage === "first_customers" ? "Learn from first customers: onboarding, outcomes and why they bought" : `Improve the constraint: ${constraint?.label ?? "funnel"}`;
  const actions: DispatchAction[] = [
    { type: "checkpoint", metric: stage === "pre_revenue" ? "paying_customers" : "activation_rate", dueInDays: 14, question: "Did the existing channels produce a readable signal?" },
  ];
  if (stage !== "pre_revenue") actions.push({ type: "owner_decision", question: "Which customer should we interview first?", options: [{ id: "a", label: "Most recent buyer" }, { id: "b", label: "Most active buyer" }], recommended: "a", why: "Recent buyers remember why they bought." });
  return { id: `obj-${now.toISOString().slice(0, 10)}-${n}`, title, status: "approved", kind: pol.defaultStrategy, metric: stage === "pre_revenue" ? "paying_customers" : "activation_rate", constraint: constraint?.key ?? null, createdAt: now.toISOString(), actions, approvedBy: "auto: zero-spend, reversible, evidence-only" };
}

export function strategicCycle(i: CycleInput): CycleOutput {
  const stage = stageOf(i.stageFacts), pol = policyFor(stage);
  const tracked = trackObjectives(i.objectives, i.lastActivity, i.now);
  const conflicts = conflictingObjectives(i.objectives);
  const live = i.objectives.filter((o) => o.status === "active" || o.status === "approved");
  const dup = new Set(tracked.filter((t) => t.duplicateOf).map((t) => t.id));
  const { planned, rejected } = planDispatch(live.filter((o) => !dup.has(o.id)), {
    stage, runningExperiments: i.running, approvedTemplates: i.approvedTemplates, alreadyDispatched: i.alreadyDispatched,
    dispatchedThisWeek: i.dispatchedThisWeek, maxPerObjectiveWeek: EXEC_AUTHORITY.maxDispatchPerObjectiveWeek, now: i.now,
  });
  // verify
  const results = i.objectives.filter((o) => o.status !== "proposed" && o.status !== "abandoned").map((o) => {
    const ob = i.observations[o.id];
    const t = tracked.find((x) => x.id === o.id);
    return evaluate({ id: o.id, title: o.title, kind: "objective", operational: ob?.operational ?? { ran: planned.some((p) => p.objectiveId === o.id) || o.status === "verifying", shipped: false, failures: 0 }, commercial: ob?.commercial ?? null, cost: ob?.cost ?? { aiCalls: 0, costCents: 0 }, ageDays: t?.ageDays ?? 0 }, stage);
  });
  const performance = rankInitiatives(results);
  const learned = performance.filter((r) => r.confidence !== "low" || r.verdict === "commercial_win").map((r) => `${r.title}: ${r.evidence}`);
  // learn -> next objective
  const needNext = !live.some((o) => !dup.has(o.id)) || performance.some((r) => r.recommendation === "stop" && live.some((o) => o.id === r.id));
  const nextObjective = needNext && !i.objectives.some((o) => o.status === "proposed") ? defaultObjectiveFor(stage, i.constraint, i.now, i.objectives.length + 1) : null;
  const allocation = allocate({ stage, candidates: defaultCandidates(stage, { klySendsWeekly: i.klySendsWeekly }) as Candidate[], capacity: { kly_sends: i.klySendsWeekly, engine_capacity: 5, content_generation: 10, ai_calls: EXEC_AUTHORITY.execAiCallsPerWeek, owner_attention: 3 } });
  const risks = buildRiskRegister(i.riskFacts);
  const org = evaluateOrganisation(i.org);
  const scoreboard = evidenceScoreboard(i.evidence);
  const gap = pol.mode === "commercial_validation" || pol.mode === "learn_from_customers" ? scoreboard.find((l) => !l.met) ?? null : null;
  const decisions = [...i.openOwnerItems, ...tracked.filter((t) => t.abandoned).map((t) => ({ question: `Approve or drop the proposed objective "${t.title}" (waiting ${t.ageDays} days)?`, recommended: "drop it unless it serves the current constraint" }))];
  const brief = buildExecBrief({
    weekLabel: i.weekLabel, adminUrl: i.adminUrl, stage, modeBanner: pol.banner, constraint: i.constraint, previousConstraint: i.previousConstraint,
    objectiveChanges: [...planned.slice(0, 3).map((p) => `Started: ${describe(p.action)}.`), ...tracked.filter((t) => t.stalled).map((t) => `Stalled: "${t.title}" has had no activity for ${t.daysSinceActivity} days.`)].slice(0, 3),
    learned: learned.slice(0, 2), decisions, next: nextObjective ? [nextObjective.title] : live.slice(0, 1).map((o) => `keep going: ${o.title}`),
    topRisk: risks[0] ? { title: risks[0].title, isNew: false } : null, scoreboardGap: gap,
  });
  return { stage, mode: pol.mode, strategy: pol.defaultStrategy, banner: pol.banner, tracked, conflicts, planned, rejected, performance, learned, allocation, risks: topRisks(risks), org, scoreboard, nextObjective, brief, spendCents: 0 };
}

export function describe(a: DispatchAction): string {
  switch (a.type) {
    case "start_experiment": return `experiment ${a.def.key}`;
    case "stop_experiment": return `conclude experiment ${a.key}`;
    case "set_flag": return `${a.enabled ? "turn on" : "turn off"} ${a.key}`;
    case "optimizer_run_request": return `ask the optimiser to look at ${a.focus}`;
    case "proposal": return `${a.proposalKind === "offer_proposal" ? "offer" : "product"} proposal "${a.title}"`;
    case "owner_decision": return `a decision for you: ${a.question}`;
    case "evidence_task": return `customer-evidence task (${a.templateId})`;
    case "checkpoint": return `measurement checkpoint on ${a.metric} in ${a.dueInDays} days`;
    case "build_request": return `build request "${a.title}"`;
  }
}

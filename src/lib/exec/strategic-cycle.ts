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
  riskFacts: RiskFacts; org: OrgFacts; klySendsWeekly: number; first10Line?: string; openOwnerItems: Array<{ question: string; recommended: string }>;
}
export interface Closure { objectiveId: string; outcome: "achieved" | "not_achieved" | "inconclusive"; evidence: string; metric: string | null; current: number | null; target: number | null }
export interface CycleOutput {
  closures: Closure[];
  stage: ExecStage; mode: string; strategy: string; banner: string;
  tracked: ReturnType<typeof trackObjectives>; conflicts: ReturnType<typeof conflictingObjectives>;
  planned: PlannedAction[]; rejected: RejectedAction[];
  performance: RankedInitiative[]; learned: string[]; allocation: AllocationPlan; risks: Risk[];
  org: ReturnType<typeof evaluateOrganisation>; scoreboard: EvidenceLine[]; next: string[];
  brief: ReturnType<typeof buildExecBrief>; spendCents: 0;
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
  // A hold_and_measure objective is never a "commercial win": meeting its target only means the evidence is now readable, so it hands back to the strategy cycle.
  const holdIds = new Set(i.objectives.filter((o) => o.kind === "hold_and_measure").map((o) => o.id));
  const hold = (r: (typeof results)[number]) => {
    const c = i.observations[r.id]?.commercial;
    return holdIds.has(r.id) && c && c.target !== null && c.current !== null && c.current >= c.target
      ? { ...r, verdict: "operational_only" as const, recommendation: "modify" as const, commercialOk: null, evidence: `Evidence target met (${c.metric}: ${c.current} >= ${c.target}). The evidence is now readable: the next strategy cycle should name the constraint.`, flags: [...r.flags, "evidence target met: hand back to strategy cycle"] }
      : r;
  };
  const performance = rankInitiatives(results.map(hold));
  // verify -> close: an objective whose measurement checkpoint was reached (status "verifying") is concluded with its measured outcome, so nothing stays open forever.
  const closures: Closure[] = i.objectives.filter((o) => o.status === "verifying").map((o) => {
    const r = performance.find((x) => x.id === o.id), c = i.observations[o.id]?.commercial;
    const met = r?.verdict === "commercial_win" || (holdIds.has(o.id) && !!r?.flags.includes("evidence target met: hand back to strategy cycle"));
    const readable = !!c && c.current !== null && c.n >= c.minN;
    const outcome: Closure["outcome"] = met ? "achieved" : readable ? "not_achieved" : "inconclusive";
    return { objectiveId: o.id, outcome, evidence: r?.evidence ?? "no measurement available", metric: c?.metric ?? null, current: c?.current ?? null, target: c?.target ?? null };
  });
  const learned = performance.filter((r) => r.confidence !== "low" || r.verdict === "commercial_win" || r.flags.some((f) => f.startsWith("evidence target met"))).map((r) => `${r.title}: ${r.evidence}`);
  // learn -> next objective. The coordinator NEVER invents objectives (that is the strategy engine's job: cycle.ts, weekly). It only reports
  // what happens next: keep going, or hand back to the strategy engine's next cycle when nothing is live / an objective should stop.
  const stopping = performance.filter((r) => r.recommendation === "stop" && live.some((o) => o.id === r.id)).map((r) => r.title);
  const next = stopping.length ? [`reassess at the next strategy cycle: "${stopping[0]}" has not moved its metric`]
    : live.length ? live.slice(0, 1).map((o) => `keep going: ${o.title}`)
    : [i.objectives.some((o) => o.status === "proposed") ? "waiting for your decision on the proposed objective" : "the weekly strategy cycle will set the next objective"];
  const allocation = allocate({ stage, candidates: defaultCandidates(stage, { klySendsWeekly: i.klySendsWeekly }) as Candidate[], buildAuthorised: live.some((o) => (o.actions ?? []).some((a) => (a as DispatchAction).type === "build_request")), capacity: { kly_sends: i.klySendsWeekly, engine_capacity: 5, content_generation: 10, ai_calls: EXEC_AUTHORITY.execAiCallsPerWeek, owner_attention: 3 } });
  const risks = buildRiskRegister(i.riskFacts);
  const org = evaluateOrganisation(i.org);
  const scoreboard = evidenceScoreboard(i.evidence);
  const gap = pol.mode === "commercial_validation" || pol.mode === "learn_from_customers" ? scoreboard.find((l) => !l.met) ?? null : null;
  const decisions = [...i.openOwnerItems, ...tracked.filter((t) => t.status === "proposed" && !t.duplicateOf).map((t) => ({ question: `Approve or drop the proposed objective "${t.title}" (waiting ${t.ageDays} days)?`, recommended: t.abandoned ? "drop it unless it serves the current constraint" : "approve it if it serves the current constraint" }))];
  const brief = buildExecBrief({
    weekLabel: i.weekLabel, adminUrl: i.adminUrl, stage, modeBanner: pol.banner, constraint: i.constraint, previousConstraint: i.previousConstraint,
    objectiveChanges: [...planned.slice(0, 3).map((p) => `Started: ${describe(p.action)}.`), ...tracked.filter((t) => t.stalled).map((t) => `Stalled: "${t.title}" has had no activity for ${t.daysSinceActivity} days.`)].slice(0, 3),
    learned: learned.slice(0, 2), decisions, next,
    first10Line: i.first10Line, topRisk: risks[0] ? { title: risks[0].title, isNew: false } : null, scoreboardGap: gap,
  });
  return { closures, stage, mode: pol.mode, strategy: pol.defaultStrategy, banner: pol.banner, tracked, conflicts, planned, rejected, performance, learned, allocation, risks: topRisks(risks), org, scoreboard, next, brief, spendCents: 0 };
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

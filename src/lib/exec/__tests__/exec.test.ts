import { describe, expect, it } from "vitest";
import { diagnoseExecConstraints, applyRootCauseNotes, CONSTRAINT_IDS, type ConstraintInputs } from "../constraints17";
import { allowedStrategies, isStrategyAllowed } from "../stage";
import { approvalFor, buildPortfolio, foldObjectives, holdAndMeasureObjective, parseObjective, validateObjective, type ObjectiveSpec, type ValidationContext } from "../objectives";
import { decideAuthority, decisionQuality, reviewDecision, type ExecDecision } from "../decisions";
import { AUTHORITY_MATRIX, assertAgentMayWrite, foldOverrides, governanceSelfCheck, isBlockedByOverride, nextAudit, verifyAuditChain, type AuditRecord } from "../governance";
import { buildBusinessContext, type ContextInput } from "../context";
import { runExecCycle } from "../cycle";
import type { Constraint } from "../../revenue/constraints";

const rc = (key: Constraint["key"], n: number, severity: number, confidence: Constraint["confidence"] = n >= 30 ? "measured" : n >= 5 ? "estimated" : "insufficient"): Constraint => ({ key, label: key, rank: 1, severity, observed: 0.01, benchmark: 0.05, n, confidence, evidence: `${key} evidence`, action: "x" });
const stage0 = { index: 0, code: "improvise", label: "Pre-revenue", roadmap: "0", why: [], notYet: [], nextMilestone: "" };
const inputs = (constraints: Constraint[], stage = stage0): ConstraintInputs => ({ revenue: { constraints, economics: null, stage } });
const emptyReport = diagnoseExecConstraints({ revenue: null });
const measuredReport = diagnoseExecConstraints(inputs([rc("activation", 60, 3), rc("first_purchase", 40, 2)]));

const spec = (o: Partial<ObjectiveSpec> = {}): ObjectiveSpec => ({
  id: "obj-x", title: "Raise the share of sign-ups that finish a pack", justification: "Activation is the primary measured constraint", outcome: "More sign-ups see their first finished ads", type: "experiment", strategy: "fix_funnel_step", constraintId: "activation",
  evidence: [{ level: "measured", text: "12/60 finished", eventId: "revenue_snapshot", constraintId: "activation" }], acceptance: [{ metric: "activation rate", comparator: ">=", target: 0.4, windowDays: 30 }],
  authority: { spendCents: 0, reversible: true, actions: ["start_experiment"] }, dependencies: [], risks: [], verification: ["re-read revenue_snapshot"], reassessWhen: ["30 more sign-ups"], ...o,
});
const ctx = (report = measuredReport, over: Partial<ValidationContext> = {}): ValidationContext => ({ stageIndex: 0, report, existing: { objectives: [], experiments: [], hypotheses: [] }, ...over });

describe("constraints17", () => {
  it("covers all 17 and marks no-data constraints insufficient", () => {
    expect(emptyReport.results).toHaveLength(17);
    expect(CONSTRAINT_IDS).toHaveLength(17);
    expect(emptyReport.results.every((r) => r.status === "insufficient_evidence")).toBe(true);
    expect(emptyReport.primary.id).toBeNull();
    expect(emptyReport.sampleBelowThreshold).toBe(true);
    expect(emptyReport.primary.whatWouldChange.length).toBeGreaterThan(0);
  });
  it("picks the single primary from measured evidence and says what would change it", () => {
    expect(measuredReport.primary.id).toBe("activation");
    expect(measuredReport.sampleBelowThreshold).toBe(false);
    expect(measuredReport.primary.whatWouldChange.length).toBeGreaterThan(0);
  });
  it("tiny samples do not become a primary constraint", () => {
    const r = diagnoseExecConstraints(inputs([rc("activation", 3, 5, "insufficient")]));
    expect(r.primary.id).toBeNull();
  });
  it("AI root-cause notes cannot change the primary nor colour insufficient constraints", () => {
    const r = applyRootCauseNotes(measuredReport, { notes: [{ id: "activation", note: "friction", causeIsProven: false }, { id: "sales", note: "x", causeIsProven: true }] });
    expect(r.primary).toEqual(measuredReport.primary);
    expect(r.results.find((x) => x.id === "activation")!.rootCause).toContain("AI note");
    expect(r.results.find((x) => x.id === "sales")!.rootCause).not.toContain("AI note");
  });
});

describe("stage filter", () => {
  it("blocks scaling, enterprise, new products before first customers; fails closed on unknown stage", () => {
    for (const s of ["scale_paid_ads", "enterprise", "new_product", "pricing_change", "new_channel", "hire_or_outsource"]) { expect(isStrategyAllowed(0, s)).toBe(false); expect(isStrategyAllowed(1, s)).toBe(false); }
    expect(isStrategyAllowed(0, "hold_and_measure")).toBe(true);
    expect(allowedStrategies(99)).toEqual(allowedStrategies(0));
    expect(isStrategyAllowed(3, "new_product")).toBe(true);
  });
});

describe("objective validator", () => {
  it("accepts a well-formed evidenced experiment", () => expect(validateObjective(spec(), ctx()).ok).toBe(true));
  it("rejects implementation details", () => expect(validateObjective(spec({ title: "Add a column to the AdRun table in src/lib/ads" }), ctx()).reasons.join()).toContain("implementation"));
  it("rejects no evidence", () => expect(validateObjective(spec({ evidence: [] }), ctx()).reasons.join()).toContain("no supporting evidence"));
  it("rejects build without a measured demonstrated constraint", () => {
    const weak = diagnoseExecConstraints(inputs([rc("activation", 12, 3)]));
    expect(validateObjective(spec({ type: "build", strategy: "fix_funnel_step", evidence: [{ level: "inferred", text: "x" }] }), ctx(weak)).reasons.join()).toContain("build requires a demonstrated constraint");
    expect(validateObjective(spec({ type: "build", strategy: "fix_funnel_step" }), ctx()).ok).toBe(true);
  });
  it("rejects build on a non-primary constraint", () => expect(validateObjective(spec({ type: "build", constraintId: "offer_attractiveness", evidence: [{ level: "measured", text: "x", constraintId: "offer_attractiveness" }] }), ctx()).ok).toBe(false));
  it("rejects stage-inappropriate strategies", () => expect(validateObjective(spec({ strategy: "scale_paid_ads" }), ctx()).reasons.join()).toContain("not appropriate at stage 0"));
  it("rejects spend beyond authority and forbidden areas", () => {
    expect(validateObjective(spec({ authority: { spendCents: 500, reversible: true, actions: [] } }), ctx()).reasons.join()).toContain("exceeds authority");
    expect(validateObjective(spec({ authority: { spendCents: 500, reversible: true, actions: [] } }), ctx(measuredReport, { ownerAuthorizedSpendCents: 500 })).reasons.join()).not.toContain("exceeds authority");
    expect(validateObjective(spec({ title: "Change the Stripe price of the unlock pack" }), ctx()).reasons.join()).toContain("forbidden");
  });
  it("rejects duplicates of objectives, experiments and hypotheses", () => {
    const e = (x: Partial<ValidationContext["existing"]>) => ctx(measuredReport, { existing: { objectives: [], experiments: [], hypotheses: [], ...x } });
    expect(validateObjective(spec(), e({ objectives: [{ id: "o1", title: "Raise the share of sign-ups that finish a pack", status: "active" }] })).reasons.join()).toContain("duplicates existing objective");
    expect(validateObjective(spec(), e({ objectives: [{ id: "o1", title: "Raise the share of sign-ups that finish a pack", status: "done" }] })).ok).toBe(true);
    expect(validateObjective(spec(), e({ experiments: [{ key: "k", hypothesis: "raise share of sign-ups that finish pack more sign-ups see first finished ads" }] })).reasons.join()).toContain("duplicates experiment");
    expect(validateObjective(spec(), e({ hypotheses: [{ text: "Raise the share of sign-ups that finish a pack: more sign-ups see their first finished ads" }] })).reasons.join()).toContain("hypothesis");
  });
  it("parseObjective assigns its own id and treats missing spend as unstated", () => {
    const p = parseObjective({ title: "T", type: "experiment", strategy: "hold_and_measure", authority: { reversible: true, actions: [] } }, "2026-W48")!;
    expect(p.id).toMatch(/^obj-2026-W48-/);
    expect(validateObjective(p, ctx()).reasons.join()).toContain("spend not stated");
    expect(parseObjective({ title: "T", type: "bogus", strategy: "hold_and_measure" }, "w")).toBeNull();
  });
});

describe("hold_and_measure hard rule", () => {
  it("below threshold: build/experiment are rejected and hold_and_measure is emitted", () => {
    const r = buildPortfolio([spec({ type: "build" }), spec({ title: "Another test of hero copy variants", type: "experiment" })], ctx(emptyReport), "2026-W48", "Pre-revenue");
    expect(r.accepted.map((v) => v.spec.type)).toEqual(["hold_and_measure"]);
    expect(r.holdForced).toBe(true);
    expect(r.rejected.length).toBe(2);
    expect(approvalFor(r.accepted[0].spec)).toBe("auto_approved");
  });
  it("hold objective itself validates and spends nothing", () => {
    const h = holdAndMeasureObjective("w", emptyReport, "Pre-revenue");
    expect(validateObjective(h, ctx(emptyReport)).ok).toBe(true);
    expect(h.authority.spendCents).toBe(0);
  });
  it("caps the portfolio at 3 open objectives", () => {
    const mk = (t: string) => spec({ title: t });
    const r = buildPortfolio([mk("alpha alpha activation funnel"), mk("bravo bravo retention cohort"), mk("charlie charlie pricing page"), mk("delta delta referral loop")], ctx(), "w", "s");
    expect(r.accepted).toHaveLength(3);
  });
  it("with measured evidence a valid experiment is allowed", () => expect(buildPortfolio([spec()], ctx(), "w", "s").accepted[0].spec.type).toBe("experiment"));
  it("approval: build and spend need the owner", () => {
    expect(approvalFor(spec({ type: "build" }))).toBe("needs_owner");
    expect(approvalFor(spec({ authority: { spendCents: 100, reversible: true, actions: [] } }))).toBe("needs_owner");
    expect(approvalFor(spec({ authority: { spendCents: 0, reversible: false, actions: [] } }))).toBe("needs_owner");
    expect(approvalFor(spec({ authority: { spendCents: 0, reversible: true, actions: ["rewrite_db"] } }))).toBe("needs_owner");
  });
});

describe("decision authority", () => {
  const base = { boundaries: [], reversibility: "reversible" as const, spendCents: 0 };
  it("classifies", () => {
    expect(decideAuthority(base).level).toBe("auto");
    expect(decideAuthority({ ...base, boundaries: ["autonomy_expansion"] }).level).toBe("owner_required");
    for (const b of ["financial", "pricing_contract", "product_change", "partnership", "data_sensitivity", "production_risk", "access"] as const) expect(decideAuthority({ ...base, boundaries: [b] }).level).toBe("owner_required");
    expect(decideAuthority({ ...base, spendCents: 1 }).level).toBe("owner_required");
    expect(decideAuthority({ ...base, reversibility: "irreversible" }).level).toBe("owner_required");
    expect(decideAuthority({ ...base, boundaries: ["billing_config"] }).level).toBe("forbidden");
    expect(decideAuthority({ ...base, boundaries: ["legal", "autonomy_expansion"] }).level).toBe("forbidden");
  });
});

describe("decision review and learning", () => {
  const d: ExecDecision = { id: "d1", question: "q", alternatives: [{ option: "a", pros: [], cons: [] }, { option: "b", pros: [], cons: [] }], chosen: "a", reasoning: "r", evidence: [{ level: "assumed", text: "e" }], uncertainty: "u", reversibility: "reversible", expected: { metric: "signups", comparator: ">=", target: 100, windowDays: 30 }, expectedOutcome: "100 signups", assumptions: ["a1"], reviewDate: "2026-12-01T00:00:00Z", boundaries: [], spendCents: 0 };
  const now = new Date("2026-12-02T00:00:00Z");
  it("met / missed / inconclusive", () => {
    expect(reviewDecision(d, { value: 120, n: 120, evidence: [] }, now).verdict).toBe("met");
    expect(reviewDecision(d, { value: 90, n: 90, evidence: [] }, now).verdict).toBe("partly_met");
    const miss = reviewDecision(d, { value: 10, n: 50, evidence: [], assumptionsHeld: [false] }, now);
    expect(miss.verdict).toBe("missed");
    expect(miss.errorTags).toEqual(expect.arrayContaining(["outcome_missed", "assumption_failed", "decided_on_assumed_evidence"]));
    expect(reviewDecision(d, null, now).verdict).toBe("inconclusive");
    expect(reviewDecision(d, { value: 1, n: 2, evidence: [] }, now).verdict).toBe("inconclusive");
  });
  it("quality stats surface recurring errors", () => {
    const miss = reviewDecision(d, { value: 10, n: 50, evidence: [], assumptionsHeld: [false, true] }, now);
    const q = decisionQuality([miss, miss, reviewDecision(d, { value: 120, n: 120, evidence: [], assumptionsHeld: [true] }, now)]);
    expect(q.judged).toBe(3); expect(q.missed).toBe(2); expect(q.assumptionsHeldRate).toBeCloseTo(3 / 5);
    expect(q.recurringErrors.map((e) => e.tag)).toContain("outcome_missed");
  });
});

describe("governance", () => {
  it("self-check passes as shipped and fails closed on missing/changed config", () => {
    expect(governanceSelfCheck().ok).toBe(true);
    expect(governanceSelfCheck({ matrix: undefined }).ok).toBe(false);
    expect(governanceSelfCheck({ matrix: { ...AUTHORITY_MATRIX, forbidden: [] } }).ok).toBe(false);
    expect(governanceSelfCheck({ matrix: { ...AUTHORITY_MATRIX, autonomous: [...AUTHORITY_MATRIX.autonomous, "raise own authority"] } }).problems.join()).toContain("changed unexpectedly");
    expect(governanceSelfCheck({ emergencyStopActive: true }).ok).toBe(false);
  });
  it("matrix forbids touching prices, caps, legal and itself", () => {
    const f = AUTHORITY_MATRIX.forbidden.join(" ");
    for (const w of ["Stripe prices", "spend caps", "legal", "authority matrix", "exec_override"]) expect(f).toContain(w);
  });
  it("agents may not write exec_override", () => {
    expect(() => assertAgentMayWrite("exec_override")).toThrow();
    expect(() => assertAgentMayWrite("exec_objective")).not.toThrow();
  });
  it("folds owner overrides", () => {
    const s = foldOverrides([{ props: { kind: "pause_objective", objectiveId: "a" } }, { props: { kind: "veto", objectiveId: "b" } }, { props: { kind: "redirect", priority: "talk to customers" } }, { props: { kind: "pause_all" } }, { props: { kind: "resume_all" } }, { props: { kind: "resume_objective", objectiveId: "a" } }]);
    expect(s.pausedAll).toBe(false); expect(s.redirect).toBe("talk to customers");
    expect(isBlockedByOverride(s, "b")).toBe(true); expect(isBlockedByOverride(s, "a")).toBe(false);
  });
  it("audit chain detects tampering", () => {
    const a = nextAudit(null, "k", { x: 1 }, new Date(0)), b = nextAudit(a, "k", { x: 2 }, new Date(1)), c = nextAudit(b, "k", { x: 3 }, new Date(2));
    expect(verifyAuditChain([a, b, c])).toBe(-1);
    expect(verifyAuditChain([a, { ...b, payload: { x: 9 } } as AuditRecord, c])).toBe(1);
    expect(verifyAuditChain([a, c])).toBe(1);
  });
});

describe("business context", () => {
  const input: ContextInput = { now: new Date("2026-11-27T00:00:00Z"), snapshot: null, channels: [], flags: { sys_reels: true, sys_x: false }, finance: null, incidents: null, infra: null, systemStatus: null, competitive: null, spendAuthority: { newPaidServiceCents: 0 }, ownerDecisions: [], optimizerActions: [], opsDecisions: [], learnings: [], experiments: [], hypotheses: [], customerVoice: null, outcomes: null };
  it("grades missing data as assumed and defaults to commercial validation", () => {
    const c = buildBusinessContext(input);
    expect(c.mode).toBe("commercial_validation");
    expect(c.sections.revenue.level).toBe("assumed"); expect(c.sections.revenue.data).toBeNull();
    expect(c.sections.commitments.data!.hardRules.length).toBeGreaterThan(3);
    expect(c.sections.systemsOn.data!.on).toEqual(["sys_reels"]);
    expect(c.evidenceSummary.assumed).toBeGreaterThan(3);
  });
});

// ---- cycle with an in-memory AdsEvent store ----
function memDb() {
  const rows: Array<{ id: string; name: string; props: any; createdAt: Date }> = []; let n = 0; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { rows, adsEvent: {
    create: async ({ data }: any) => { const r = { id: `e${++n}`, name: data.name, props: data.props, createdAt: new Date(Date.now() + n) }; rows.push(r); return r; }, // eslint-disable-line @typescript-eslint/no-explicit-any
    findMany: async ({ where, orderBy, take }: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      let r = rows.filter((x) => (where.name?.in ? where.name.in.includes(x.name) : true));
      r = [...r].sort((a, b) => (orderBy?.createdAt === "desc" ? b.createdAt.getTime() - a.createdAt.getTime() : a.createdAt.getTime() - b.createdAt.getTime()));
      return r.slice(0, take ?? 100);
    } } };
}
const gatherEmpty = async (): Promise<ContextInput> => ({ now: new Date("2026-11-27T00:00:00Z"), snapshot: null, channels: [], flags: {}, finance: null, incidents: null, infra: null, systemStatus: null, competitive: null, spendAuthority: null, ownerDecisions: [], optimizerActions: [], opsDecisions: [], learnings: [], experiments: [], hypotheses: [], customerVoice: null, outcomes: null });
describe("runExecCycle", () => {
  const now = new Date("2026-11-27T10:00:00Z");
  const mk = (db: ReturnType<typeof memDb>, o: Partial<Parameters<typeof runExecCycle>[0]> = {}) => ({ db, now, forced: false, dryRun: false, maxCalls: 10, emergencyStopActive: false, gather: gatherEmpty, ask: async () => ({ objectives: [{ title: "Build a new referral product", justification: "j", outcome: "o", type: "build", strategy: "new_product", constraintId: null, evidence: [{ level: "assumed", text: "hunch", eventId: null }], acceptance: [{ metric: "m", comparator: ">=", target: 1, windowDays: 30 }], authority: { spendCents: 0, reversible: true, actions: [] }, dependencies: [], risks: [], verification: ["v"], reassessWhen: ["w"] }] }), ...o });
  it("with no evidence the AI's build idea is rejected and hold_and_measure is stored and auto-approved", async () => {
    const db = memDb(); const r = await runExecCycle(mk(db));
    expect(r.status).toBe("ok"); expect(r.holdForced).toBe(true); expect(r.rejected).toBe(1);
    const obj = db.rows.filter((x) => x.name === "exec_objective");
    expect(obj).toHaveLength(1); expect(obj[0].props.spec.type).toBe("hold_and_measure"); expect(obj[0].props.approval).toBe("auto_approved");
    expect(db.rows.some((x) => x.name === "exec_decision")).toBe(true);
    expect(db.rows.some((x) => x.name === "exec_context")).toBe(true);
    const cyc = db.rows.find((x) => x.name === "exec_cycle")!; expect(cyc.props.mode).toBe("hold_and_measure");
    expect(verifyAuditChain(db.rows.filter((x) => x.name === "exec_audit").map((x) => x.props))).toBe(-1);
  });
  it("is idempotent per ISO week and forced runs do not duplicate objectives", async () => {
    const db = memDb(); await runExecCycle(mk(db));
    expect((await runExecCycle(mk(db))).status).toBe("skipped");
    await runExecCycle(mk(db, { forced: true }));
    expect(db.rows.filter((x) => x.name === "exec_objective")).toHaveLength(1);
  });
  it("owner pause_all halts without writing objectives; emergency stop halts", async () => {
    const db = memDb(); await db.adsEvent.create({ data: { name: "exec_override", props: { kind: "pause_all" } } });
    expect((await runExecCycle(mk(db))).status).toBe("paused_by_owner");
    expect(db.rows.filter((x) => x.name === "exec_objective")).toHaveLength(0);
    expect((await runExecCycle(mk(memDb(), { emergencyStopActive: true }))).status).toBe("halted");
  });
  it("dry run writes nothing", async () => {
    const db = memDb(); const r = await runExecCycle(mk(db, { dryRun: true }));
    expect(r.status).toBe("ok"); expect(db.rows).toHaveLength(0);
  });
  it("AI failure still yields hold_and_measure; budget cap stops AI calls", async () => {
    const db = memDb(); const r = await runExecCycle(mk(db, { ask: async () => { throw new Error("codex down"); } }));
    expect(r.status).toBe("ok"); expect(r.holdForced).toBe(true);
    const db2 = memDb(); let calls = 0;
    const r2 = await runExecCycle(mk(db2, { maxCalls: 0, ask: async () => { calls++; return null; } }));
    expect(calls).toBe(0); expect(r2.holdForced).toBe(true);
  });
  it("a failing step is isolated and reported", async () => {
    const db = memDb(); const r = await runExecCycle(mk(db, { gather: async () => { throw new Error("db down"); } }));
    expect(r.status).toBe("failed"); expect(r.stepErrors.context).toContain("db down");
  });
  it("objective fold drives the handoff", async () => {
    const db = memDb(); await runExecCycle(mk(db));
    const m = foldObjectives(db.rows);
    expect([...m.values()][0].status).toBe("approved");
  });
});

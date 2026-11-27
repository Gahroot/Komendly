// End-to-end strategic cycle harness on an in-memory AdsEvent store. Two fixtures: pre-revenue and first-customers.
// strategy (cycle.ts, weekly) -> objective -> coordination (strategicCycle) -> verification/closure -> learning -> reassess -> next objective.
import { describe, expect, it } from "vitest";
import { runExecCycle } from "../cycle";
import { strategicCycle, type CycleInput } from "../strategic-cycle";
import { foldObjectives, isHandoffReady } from "../objectives";
import { toLite } from "../objective-adapter";
import { EXEC_AUTHORITY } from "../authority-defaults";
import { AUTHORITY_MATRIX, EXPECTED_MATRIX_FINGERPRINT, MATRIX_FINGERPRINT, assertAgentMayWrite, canChangeGovernance, governanceSelfCheck, EXEC_EVENTS } from "../governance";
import { decideFirst10 } from "../first10";
import type { ContextInput } from "../context";
import { STRATEGIES } from "../stage";

function memDb() {
  const rows: any[] = []; let n = 0;
  const match = (r: any, w: any) => (!w.name || (typeof w.name === "string" ? r.name === w.name : w.name.in.includes(r.name)));
  return { rows, adsEvent: {
    create: async ({ data }: any) => { const r = { id: `e${++n}`, createdAt: new Date(2026, 10, 1, 0, 0, n), ...data }; rows.push(r); return r; },
    findMany: async ({ where, orderBy, take }: any = {}) => { let o = rows.filter((r) => match(r, where ?? {})); if (orderBy?.createdAt === "desc") o = [...o].reverse(); return o.slice(0, take ?? 1e9); },
    findFirst: async ({ where }: any = {}) => rows.find((r) => match(r, where ?? {})) ?? null,
  } };
}
const R = { value: null, successes: 0, n: 0, lo: null, hi: null, confidence: "insufficient" };
const snap = (paying: number, signups: number) => ({ day: "2026-11-27", economics: { payingCustomers: paying, funnel: { signups, activated: Math.round(signups * 0.5), firstPurchases: paying }, mrrCents: { cents: 0 }, rates: { visitToSignup: R, signupToActivated: R, activatedToPurchase: R, signupToPurchase: R, upsellShownToBought: R, upsellBoughtToSubscriber: R, day30Retention: R }, byChannel: [], refunds: { count: 0, cents: 0 }, revenue: { allTimeCents: paying * 900 }, windowDays: 90, cacCents: {}, ltgpToCac: { confidence: "insufficient" }, payback30: {}, assumptions: [], cashFlow: { confidence: "insufficient", inCents: 0, outCents: 0, netCents: 0 } }, constraints: [], stage: { index: paying > 0 ? 1 : 0, code: "improvise", label: "stage", roadmap: "", why: [], notYet: [], nextMilestone: "" } });
const ctxIn = (paying: number, signups: number, now: Date): ContextInput => ({ now, snapshot: snap(paying, signups) as any, channels: [], flags: {}, finance: null, incidents: null, infra: null, systemStatus: null, competitive: null, spendAuthority: null, ownerDecisions: [], optimizerActions: [], opsDecisions: [], learnings: [], experiments: [], hypotheses: [], customerVoice: null, outcomes: null });
const greedyAI = async () => ({ objectives: [
  { title: "Build a brand new enterprise product line", justification: "growth", outcome: "more revenue", type: "build", strategy: "new_product", constraintId: null, evidence: [{ level: "assumed", text: "feels right", eventId: null }], acceptance: [{ metric: "x", comparator: ">=", target: 1, windowDays: 30 }], authority: { spendCents: 50000, reversible: false, actions: ["build"] }, dependencies: [], risks: [], verification: [], reassessWhen: [] },
  { title: "Scale paid ads to $500 a day", justification: "growth", outcome: "more signups", type: "experiment", strategy: "scale_paid_ads", constraintId: null, evidence: [], acceptance: [], authority: { spendCents: 50000, reversible: false, actions: [] }, dependencies: [], risks: [], verification: [], reassessWhen: [] },
] });
const coordInput = (db: ReturnType<typeof memDb>, now: Date, paying: number, metrics: Record<string, number>): CycleInput => {
  const states = foldObjectives(db.rows);
  const approvedTemplates: string[] = [];
  const objectives = [...states.values()].map((s) => ({ ...toLite(s, { approvedTemplates }), createdAt: s.updatedAt ?? now.toISOString() }));
  const observations: CycleInput["observations"] = {};
  for (const s of states.values()) { const a = s.spec.acceptance[0]; if (!a) continue; const cur = metrics[a.metric]; observations[s.spec.id] = { operational: { ran: true, shipped: s.status === "verifying" || s.status === "done", failures: 0 }, commercial: cur === undefined ? null : { metric: a.metric, baseline: 0, current: cur, target: a.target, n: cur, minN: 5, unit: "count" }, cost: { aiCalls: 0, costCents: 0 } }; }
  return { now, weekLabel: "W", adminUrl: "/x", stageFacts: { payingCustomers: paying, mrrCents: 0 }, evidence: { signups30d: 60, freePacksFinished30d: 20, unlocks9Total: paying, payingCustomers: paying, coldSends30d: 800, replies30d: 1, customerConversations: 1 },
    constraint: null, previousConstraint: null, objectives, observations, lastActivity: {}, running: [], approvedTemplates, alreadyDispatched: new Set(), dispatchedThisWeek: {}, riskFacts: { coldSendsByDomain: {}, paymentProcessors: 1, aiProviders: 1, googleAccounts: 1, metaApprovalPending: true, platformPolicyDependency: true, spamhausListedDomains: [], complaints30d: 0, bounceRate7d: null, sends7d: 0, singleReplicaServices: [], backupVerified: null }, org: { systems: [], decisionLatencyDays: [], ownerInterventionsByWeek: [], ownerDecisionsOpen: 0 }, klySendsWeekly: 100, openOwnerItems: [] };
};

describe.each([["pre-revenue", 0, 60], ["first-customers", 2, 120]])("strategic cycle: %s fixture", (_n, paying, signups) => {
  it("runs the full loop repeatably, with no owner input, never scaling or building, never exceeding authority", async () => {
    const db = memDb();
    const wk = (d: number) => new Date(Date.UTC(2026, 10, 27 + d));
    // week 1: strategy proposes; greedy AI output is rejected; hold_and_measure auto-approved
    const r1 = await runExecCycle({ db, now: wk(0), forced: false, dryRun: false, maxCalls: 10, emergencyStopActive: false, gather: async () => ctxIn(paying, signups, wk(0)), ask: greedyAI });
    expect(r1.stepErrors).toEqual({}); expect(r1.status).toBe("ok");
    const specs = db.rows.filter((r) => r.name === "exec_objective").map((r) => r.props.spec);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) {
      expect(["hold_and_measure", "evidence_gathering", "operate"]).toContain(s.type);
      expect(s.authority.spendCents).toBe(0);
      expect(s.strategy).not.toMatch(/scale_paid_ads|new_product|enterprise/);
    }
    expect(specs[0].type).toBe("hold_and_measure");
    // coordination: objective is executable, dispatches only allow-listed reversible actions at $0
    const c1 = strategicCycle(coordInput(db, wk(0), paying, {}));
    expect(c1.spendCents).toBe(0);
    expect(c1.planned.length).toBeGreaterThan(0);
    for (const p of c1.planned) { expect(p.reversible).toBe(true); expect(["checkpoint", "evidence_task", "owner_decision", "optimizer_run_request"]).toContain(p.action.type); }
    expect(c1.allocation.lines.find((l) => l.id === "new_feature_build")?.status).toBe("unfunded");
    expect(c1.allocation.lines.find((l) => l.id === "meta_ads_scale")?.allotted).toBe(0);
    expect(c1.allocation.spendCents).toBe(0);
    // execution -> verification: checkpoint due, objective moves to verifying; target met -> closure, hands back to strategy
    const id = specs[0].id;
    await db.adsEvent.create({ data: { name: EXEC_EVENTS.objectiveStatus, props: { objectiveId: id, status: "verifying" } } });
    const c2 = strategicCycle(coordInput(db, wk(14), paying, { "funnel steps with 30+ observations": 4, "customer answers to why-not-buy": 11 }));
    expect(c2.closures).toHaveLength(1); expect(c2.closures[0]!.outcome).toBe("achieved");
    expect(c2.performance[0]!.recommendation).not.toBe("expand"); // hold objective is never a commercial win
    await db.adsEvent.create({ data: { name: EXEC_EVENTS.objectiveStatus, props: { objectiveId: id, status: "done", evidence: c2.closures[0] } } });
    // learn -> reassess -> next objective: the next weekly strategy cycle (no owner input in between) sets a new one
    const r2 = await runExecCycle({ db, now: wk(7), forced: false, dryRun: false, maxCalls: 10, emergencyStopActive: false, gather: async () => ctxIn(paying, signups, wk(7)), ask: greedyAI });
    expect(r2.status).toBe("ok");
    expect(foldObjectives(db.rows).size).toBeGreaterThanOrEqual(2);
    expect(db.rows.filter((r) => r.name === "exec_objective" && !isHandoffReady({ approval: r.props.approval, status: r.props.status } as any)).every((r) => r.props.spec.authority.spendCents === 0 || r.props.approval === "needs_owner")).toBe(true);
    expect(db.rows.some((r) => r.name === "exec_override")).toBe(false); // nothing wrote an owner override
  });
  it("the coordinator never invents an objective when none is live", () => {
    const c = strategicCycle(coordInput(memDb(), new Date(), paying, {}));
    expect(c.planned).toHaveLength(0);
    expect(c.next[0]).toMatch(/strategy cycle/);
  });
});

describe("pre-revenue stage rules", () => {
  it("is hold_and_measure and blocks scaling/new product strategies", () => {
    const c = strategicCycle(coordInput(memDb(), new Date(), 0, {}));
    expect(c.stage).toBe("pre_revenue"); expect(c.strategy).toBe("hold_and_measure"); expect(c.mode).toBe("commercial_validation");
    expect(STRATEGIES.length).toBeGreaterThan(5);
  });
});

describe("governance / authority", () => {
  it("fingerprint check passes in normal operation (does not halt)", async () => {
    expect(MATRIX_FINGERPRINT).toBe(EXPECTED_MATRIX_FINGERPRINT);
    expect(governanceSelfCheck().ok).toBe(true);
    const db = memDb();
    const r = await runExecCycle({ db, now: new Date(), forced: false, dryRun: false, maxCalls: 2, emergencyStopActive: false, gather: async () => ctxIn(0, 60, new Date()), ask: async () => null });
    expect(r.stepErrors).toEqual({}); expect(r.status).toBe("ok"); expect(r.governance?.ok).toBe(true);
  });
  it("an edited matrix halts every cycle (fail closed)", () => {
    const widened = { ...AUTHORITY_MATRIX, forbidden: AUTHORITY_MATRIX.forbidden.slice(1) };
    expect(governanceSelfCheck({ matrix: widened }).ok).toBe(false);
  });
  it("agents cannot write overrides or run requests, cannot change governance", () => {
    expect(() => assertAgentMayWrite("exec_override")).toThrow();
    expect(() => assertAgentMayWrite("exec_run_request")).toThrow();
    expect(() => assertAgentMayWrite("exec_objective")).not.toThrow();
    expect(canChangeGovernance("exec-coordinator")).toBe(false); expect(canChangeGovernance("exec-strategy")).toBe(false); expect(canChangeGovernance("owner")).toBe(true);
  });
  it("authority forbids raising itself and touching its own governance/prices/caps", () => {
    const f = AUTHORITY_MATRIX.forbidden.join(" | ");
    expect(f).toMatch(/authority matrix/); expect(f).toMatch(/spend caps/); expect(f).toMatch(/Stripe prices/); expect(f).toMatch(/emergency stop/);
    expect(AUTHORITY_MATRIX.needsApproval.join(" ")).toMatch(/expanding the executive layer's own autonomy/);
  });
  it("coordinator authority defaults spend nothing", () => { expect(EXEC_AUTHORITY.newPaidServiceCents).toBe(0); });
  it("owner pause_all stops the cycle", async () => {
    const db = memDb(); await db.adsEvent.create({ data: { name: "exec_override", props: { kind: "pause_all" } } });
    expect((await runExecCycle({ db, now: new Date(), forced: false, dryRun: false, maxCalls: 2, emergencyStopActive: false, gather: async () => ctxIn(0, 60, new Date()), ask: async () => null })).status).toBe("paused_by_owner");
  });
});

describe("first-10 verification", () => {
  const pay = (id: string, ws: string, props: object, name = "purchased") => ({ id, name, workspaceId: ws, props, createdAt: new Date(2026, 10, 25) });
  const base = { refundedWorkspaces: new Set<string>(), ownerExcluded: { workspaceIds: new Set<string>(), emails: new Set<string>() } };
  it("counts an independent $9 buyer with a live Stripe id; excludes internal, test, no-ref, duplicate, refunded, incentivised", () => {
    const r = decideFirst10({ ...base, refundedWorkspaces: new Set(["w6"]),
      payments: [pay("1", "w1", { amountCents: 900, checkoutSessionId: "cs_live_a" }), pay("2", "w2", { amountCents: 900, checkoutSessionId: "cs_live_b" }), pay("3", "w3", { amountCents: 900, checkoutSessionId: "cs_test_c" }), pay("4", "w4", { amountCents: 900 }), pay("5", "w5", { amountCents: 900, checkoutSessionId: "cs_live_e" }), pay("6", "w6", { amountCents: 900, checkoutSessionId: "cs_live_f" }), pay("7", "w7", { amountCents: 0, checkoutSessionId: "cs_live_g" }), pay("8", "w8", { amountCents: 900, checkoutSessionId: "cs_live_h", percentOff: 100 }), pay("9", "w9", { amountCents: 900, checkoutSessionId: "cs_live_i" })],
      owners: { w1: { email: "a@comcast.net" }, w2: { email: "x@getkomendly.com" }, w3: { email: "c@x.com" }, w4: { email: "d@x.com" }, w5: { email: "a@comcast.net" }, w6: { email: "f@x.com" }, w7: { email: "g@x.com" }, w8: { email: "h@x.com" }, w9: { email: "A.@comcast.net" } } });
    expect(r.verified).toBe(1); expect(r.customers[0]!.stripeRef).toBe("cs_live_a");
    expect(r.excluded.map((e) => e.reason).sort()).toEqual(["duplicate_of_earlier_customer", "duplicate_of_earlier_customer", "incentivised", "internal_account", "no_stripe_reference", "refunded", "test_mode_payment", "zero_or_negative_amount"].sort());
    expect(r.contributionCents).toBeNull(); expect(r.reached).toBe(false);
  });
  it("owner exclusion list is honoured and nothing is fabricated when empty", () => {
    expect(decideFirst10({ ...base, payments: [], owners: {} }).verified).toBe(0);
    const r = decideFirst10({ ...base, ownerExcluded: { workspaceIds: new Set(["w1"]), emails: new Set() }, payments: [pay("1", "w1", { amountCents: 900, checkoutSessionId: "cs_live_a" })], owners: { w1: { email: "a@x.com" } } });
    expect(r.verified).toBe(0); expect(r.excluded[0]!.reason).toBe("owner_marked_not_independent");
  });
});

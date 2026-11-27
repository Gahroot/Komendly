import { describe, expect, it } from "vitest";
import { hypothesisBlocked, hypothesisHash, isoWeekKey, failureStreak, parseDecision, shouldRunCycle, validateActions, type Decision, type GuardContext, type ProposedAction } from "../actions";
import { runOptimizerCycle, type CycleDeps } from "../cycle";
import { buildDigest } from "../digest";
import { businessStage, diagnose, parseSnapshot, spendGate } from "../diagnose";
import { dedupeKnowledge, getRelevantKnowledge, normaliseEvent, rankForTopic } from "../knowledge";

const now = new Date("2026-11-26T10:00:00Z");
const act = (p: Partial<ProposedAction>): ProposedAction => ({ type: "owner_decision", reason: "because", evidence_level: "measured", evidence: "", sample_size: 0, hypothesis: "", experiment_key: "", winner_id: "", arm_id: "", surface: "", prefer: [], avoid: [], system_key: "", title: "", detail: "", ...p });
const dec = (...actions: ProposedAction[]): Decision => ({ summary: "s", actions, learnings: [], next_week: "n" });
const ctx = (p: Partial<GuardContext> = {}): GuardContext => ({ experiments: [], proposals: [], arms: [], channels: [], ledger: [], now, ...p });
const exp = (a: [number, number], b: [number, number], status = "running") => ({ key: "e1", surface: "offer", status, variants: [{ id: "control", n: a[0], conversions: a[1] }, { id: "v2", n: b[0], conversions: b[1] }] });

describe("diagnose", () => {
  const snap = parseSnapshot({ payingCustomers: 0, funnel: [{ step: "visit", count: 2000 }, { step: "signup", count: 60 }, { step: "free_ad", count: 12 }, { step: "paid", count: 0 }] });
  it("stage by paying customers", () => { expect(businessStage(0)).toBe("pre_revenue"); expect(businessStage(3)).toBe("first_customers"); expect(businessStage(80)).toBe("scaling"); });
  it("names the dominant drop vs benchmark and tags evidence", () => {
    const d = diagnose(snap);
    expect(d.constraint.kind).toBe("conversion");
    expect(d.constraint.name).toBe("signup_to_free_ad");
    expect(d.constraint.level).toBe("inferred"); // only 60 upstream
    expect(d.cautions.join(" ")).toMatch(/60/);
  });
  it("tiny top of funnel = volume constraint, assumption without funnel", () => {
    expect(diagnose(parseSnapshot({ funnel: [{ step: "visit", count: 10 }, { step: "signup", count: 0 }] })).constraint.name).toBe("volume");
    const none = diagnose(null);
    expect(none.constraint.level).toBe("assumed");
    expect(none.cautions[0]).toMatch(/No revenue snapshot/);
  });
  it("paid scale gate needs payback<30, LTGP:CAC>=3, measured", () => {
    expect(spendGate(undefined).allowPaidScale).toBe(false);
    expect(spendGate({ paybackDays: { value: 20, confidence: "measured" }, ltgpCac: { value: 3.5, confidence: "measured" } }).allowPaidScale).toBe(true);
    expect(spendGate({ paybackDays: { value: 20, confidence: "estimated" }, ltgpCac: { value: 3.5, confidence: "estimated" } }).allowPaidScale).toBe(false);
    expect(spendGate({ paybackDays: { value: 45, confidence: "measured" }, ltgpCac: { value: 3.5, confidence: "measured" } }).allowPaidScale).toBe(false);
  });
});

describe("decision parsing and guardrails", () => {
  it("fails closed on malformed output", () => {
    expect(parseDecision("not json")).toBeNull();
    expect(parseDecision({ actions: "x", summary: "s" })).toBeNull();
    expect(parseDecision(null)).toBeNull();
    expect(parseDecision(JSON.stringify(dec()))).not.toBeNull();
  });
  it("refuses unsafe / unknown action types", () => {
    const unsafe = ["change_price", "raise_cap", "unpause_governor", "increase_ad_spend", "delete_data", "send_customer_email", "new_guarantee", ""].map((type) => act({ type }));
    const r = validateActions(dec(...unsafe), ctx());
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(unsafe.length);
    expect(r.rejected[0]!.reason).toMatch(/allow-list/);
  });
  it("caps at 5 actions", () => {
    const r = validateActions(dec(...Array.from({ length: 8 }, (_, i) => act({ title: `t${i}`, detail: "d" }))), ctx());
    expect(r.valid).toHaveLength(5);
    expect(r.rejected).toHaveLength(3);
  });
  it("refuses to conclude with tiny samples or few conversions", () => {
    const a = act({ type: "conclude_experiment", experiment_key: "e1", winner_id: "v2" });
    expect(validateActions(dec(a), ctx({ experiments: [exp([40, 2], [40, 6])] })).rejected[0]!.reason).toMatch(/sample too small/);
    expect(validateActions(dec(a), ctx({ experiments: [exp([500, 1], [500, 4])] })).rejected[0]!.reason).toMatch(/conversions/);
  });
  it("concludes only the leading variant with enough evidence", () => {
    const e = exp([400, 8], [400, 24]);
    expect(validateActions(dec(act({ type: "conclude_experiment", experiment_key: "e1", winner_id: "v2" })), ctx({ experiments: [e] })).valid).toHaveLength(1);
    expect(validateActions(dec(act({ type: "conclude_experiment", experiment_key: "e1", winner_id: "control" })), ctx({ experiments: [e] })).rejected[0]!.reason).toMatch(/leading/);
    expect(validateActions(dec(act({ type: "conclude_experiment", experiment_key: "e1", winner_id: "v2" })), ctx({ experiments: [exp([400, 8], [400, 24], "concluded")] })).rejected).toHaveLength(1);
  });
  it("respects concurrency per surface, including within one cycle", () => {
    const proposals = [{ key: "p1", surface: "offer", hypothesis: "h1", validated: true }, { key: "p2", surface: "offer", hypothesis: "h2", validated: true }, { key: "p3", surface: "pricing_page", hypothesis: "h3", validated: true }, { key: "p4", surface: "x", hypothesis: "h4", validated: false }];
    const s = (k: string) => act({ type: "start_experiment", experiment_key: k });
    const r = validateActions(dec(s("p1"), s("p2"), s("p3"), s("p4")), ctx({ proposals }));
    expect(r.valid.map((v) => v.params.key)).toEqual(["p1", "p3"]);
    expect(r.rejected.map((x) => x.reason)).toEqual([expect.stringMatching(/already has 1 running/), expect.stringMatching(/not validated/)]);
    const busy = validateActions(dec(s("p1")), ctx({ proposals, experiments: [{ key: "other", surface: "offer", status: "running", variants: [] }] }));
    expect(busy.valid).toHaveLength(0);
  });
  it("retires only clearly losing arms and keeps >= 2 active", () => {
    const arm = (id: string, sends: number, pos: number, status = "active") => ({ id, dimension: "subject", key: id, status, sends, positiveReplies: pos, signups: 0, paid: 0 });
    const arms = [arm("a", 1000, 100), arm("b", 1000, 2), arm("c", 1000, 90)];
    const r = (id: string, arms2 = arms) => validateActions(dec(act({ type: "retire_arm", arm_id: id })), ctx({ arms: arms2 }));
    expect(r("b").valid).toHaveLength(1);
    expect(r("c").rejected[0]!.reason).toMatch(/not clearly worse/);
    expect(r("b", arms.slice(0, 2)).rejected[0]!.reason).toMatch(/fewer than 2/);
    expect(r("b", [arm("a", 1000, 100), arm("b", 50, 0), arm("c", 1000, 90)]).rejected[0]!.reason).toMatch(/200 sends/);
    expect(r("a", [arm("a", 1000, 100, "champion"), arm("b", 1000, 2), arm("c", 1000, 90)]).rejected[0]!.reason).toMatch(/only active/);
  });
  it("suspends a channel only when the registry rule says suspend", () => {
    const ch = (signups: number) => ({ source: "pins", label: "Pins", actions: 600, signups, payments: 0, flag: "sys_pins", flagOn: true });
    const a = act({ type: "suspend_system", system_key: "pins" });
    expect(validateActions(dec(a), ctx({ channels: [ch(0)] })).valid[0]!.params.flag).toBe("sys_pins");
    expect(validateActions(dec(a), ctx({ channels: [ch(3)] })).rejected).toHaveLength(1);
  });
  it("shift_emphasis is limited to reels and content_queue", () => {
    expect(validateActions(dec(act({ type: "shift_emphasis", surface: "reels", prefer: ["plumber"] })), ctx()).valid).toHaveLength(1);
    expect(validateActions(dec(act({ type: "shift_emphasis", surface: "pricing", prefer: ["x"] })), ctx()).rejected).toHaveLength(1);
  });
  it("hypothesis ledger blocks retries until 60 days or changed conditions", () => {
    const h = hypothesisHash("offer", "Free trial lifts paid");
    expect(h).toBe(hypothesisHash(" Offer", "free  trial lifts paid!"));
    const l = [{ hash: h, at: "2026-10-20T00:00:00Z", outcome: "failed" as const, conditionsKey: "a" }];
    expect(hypothesisBlocked(l, h, now)).toMatch(/failed/);
    expect(hypothesisBlocked(l, h, now, "b")).toBeNull();
    expect(hypothesisBlocked(l, h, new Date("2027-01-10T00:00:00Z"))).toBeNull();
    const proposals = [{ key: "p1", surface: "offer", hypothesis: "Free trial lifts paid", validated: true }];
    expect(validateActions(dec(act({ type: "start_experiment", experiment_key: "p1" })), ctx({ proposals, ledger: l })).rejected[0]!.reason).toMatch(/same hypothesis/);
  });
  it("idempotency helpers", () => {
    expect(isoWeekKey(now)).toBe("2026-W48");
    expect(shouldRunCycle("2026-W48", now, false)).toBe(false);
    expect(shouldRunCycle("2026-W48", now, true)).toBe(true);
    expect(shouldRunCycle("2026-W47", now, false)).toBe(true);
    expect(failureStreak(["ok", "failed", "failed", "failed"])).toBe(3);
    expect(failureStreak(["failed", "failed", "ok"])).toBe(0);
  });
});

function deps(over: Partial<CycleDeps> & { out?: unknown } = {}) {
  const events: Array<{ name: string; props: Record<string, unknown> }> = [];
  const executed: string[] = [];
  const calls = { decide: 0 };
  const good = { summary: "s", next_week: "n", learnings: [{ kind: "assumption", title: "T", note: "N", source: "" }], actions: [act({ type: "owner_decision", title: "Pick price test", detail: "Owner call", reason: "r" }), act({ type: "change_price", reason: "x" })] };
  const d: CycleDeps = {
    now, env: {}, forced: false, adminUrl: "https://x/admin",
    enabled: async () => true, lastWeek: async () => null,
    gather: async () => ({ snapshot: null, payingCustomers: 0, facts: {}, guard: { experiments: [], proposals: [], arms: [], channels: [], ledger: [] } }),
    decide: async () => { calls.decide++; return { json: over.out === undefined ? good : over.out, text: "" }; },
    execute: async (v, c) => { executed.push(v.type); if (v.action.title === "boom") throw new Error("boom"); return `${c.dryRun ? "dry " : ""}did ${v.type}`; },
    record: async (name, props) => { events.push({ name, props }); },
    digestEnabled: async () => true, sendDigest: async () => undefined,
    ...over,
  };
  return { d, events, executed, calls };
}

describe("cycle", () => {
  it("runs: executes allow-listed, rejects unsafe, records action + learning + cycle", async () => {
    const { d, events, executed } = deps();
    const r = await runOptimizerCycle(d);
    expect(r.status).toBe("ok");
    expect(executed).toEqual(["owner_decision"]);
    const names = events.map((e) => e.name);
    expect(names).toContain("optimizer_learning");
    expect(names.at(-1)).toBe("optimizer_cycle");
    expect(events.find((e) => e.props.rejected)?.props.result).toMatch(/allow-list/);
    expect(events.find((e) => e.name === "optimizer_action" && !e.props.rejected)?.props.reversible).toBeTruthy();
  });
  it("is idempotent per ISO week unless forced; kill switch stops it", async () => {
    expect((await runOptimizerCycle(deps({ lastWeek: async () => "2026-W48" }).d)).status).toBe("skipped");
    expect((await runOptimizerCycle(deps({ lastWeek: async () => "2026-W48", forced: true }).d)).status).toBe("ok");
    const off = deps({ enabled: async () => false });
    expect(await runOptimizerCycle(off.d)).toEqual({ status: "skipped", reason: "disabled" });
    expect(off.calls.decide).toBe(0);
  });
  it("dry run executes nothing real and says so", async () => {
    const { d, events } = deps({ env: { OPTIMIZER_DRY_RUN: "1" } });
    const r = await runOptimizerCycle(d);
    expect(r.status === "ok" && r.dryRun).toBe(true);
    const a = events.find((e) => e.name === "optimizer_action" && !e.props.rejected)!;
    expect(a.props.dryRun).toBe(true);
    expect(String(a.props.result)).toMatch(/^DRY RUN/);
  });
  it("fails closed on malformed AI output (2 calls, no actions) and honours the call budget", async () => {
    const bad = deps({ out: "garbage" });
    const r = await runOptimizerCycle(bad.d);
    expect(r.status).toBe("failed");
    expect(bad.calls.decide).toBe(2);
    expect(bad.executed).toHaveLength(0);
    expect(bad.events.at(-1)!.props.ok).toBe(false);
    const tight = deps({ out: "garbage", env: { OPTIMIZER_MAX_CALLS: "1" } });
    const t = await runOptimizerCycle(tight.d);
    expect(t.status === "failed" && /budget/.test(t.error)).toBe(true);
    expect(tight.calls.decide).toBe(1);
  });
  it("one failing action never aborts the rest", async () => {
    const out = { summary: "s", next_week: "n", learnings: [], actions: [act({ title: "boom", detail: "d" }), act({ title: "fine", detail: "d" })] };
    const { d, executed, events } = deps({ out });
    const r = await runOptimizerCycle(d);
    expect(executed).toHaveLength(2);
    expect(r.status === "ok" && r.failed).toBe(1);
    expect(events.filter((e) => e.name === "optimizer_action").map((e) => e.props.ok)).toEqual([false, true]);
  });
  it("digest failure does not fail the cycle", async () => {
    const r = await runOptimizerCycle(deps({ sendDigest: async () => { throw new Error("smtp"); } }).d);
    expect(r.status === "ok" && r.digestSent).toBe(false);
  });
});

describe("digest", () => {
  it("reads like a short human update", () => {
    const diagnosis = diagnose(parseSnapshot({ funnel: [{ step: "visit", count: 2000 }, { step: "signup", count: 20 }] }));
    const m = buildDigest({ week: "2026-W48", diagnosis, decision: { summary: "", actions: [], next_week: "Watch sign-ups", learnings: [{ kind: "assumption", title: "Hook X", note: "might help", source: "" }] }, outcomes: [{ type: "owner_decision", reason: "r", result: "add to the needs-you list: Pick", ok: true, dryRun: false, evidence_level: "inferred" }], rejected: [], ownerItems: [{ title: "Pick", detail: "d" }], dryRun: false, adminUrl: "https://x" });
    expect(m.text).toMatch(/Where we are/);
    expect(m.text).toMatch(/assumption, not yet proven/);
    expect(m.text).toMatch(/Needs you:/);
    expect(m.text.split("\n").length).toBeLessThan(25);
  });
});

describe("knowledge base", () => {
  const ev = (name: string, props: object, d = "2026-11-20") => ({ name, props, createdAt: new Date(d) });
  it("normalises, ranks by evidence and flags conflicts", () => {
    const items = [
      normaliseEvent(ev("optimizer_learning", { claim: "Plumber hooks get more reel plays", level: "measured", sampleSize: 40 }))!,
      normaliseEvent(ev("customer_success_finding", { finding: "Plumber hooks do not get more reel plays", level: "assumed" }))!,
      normaliseEvent(ev("optimizer_learning", { claim: "Subject lines with a city name get replies", kind: "evidence", n: 300 }))!,
    ];
    expect(normaliseEvent(ev("x", {}))).toBeNull();
    const d = dedupeKnowledge(items);
    expect(d).toHaveLength(2);
    expect(d.find((i) => /Plumber/.test(i.claim))).toMatchObject({ level: "measured", contested: true });
    expect(rankForTopic(d, "reel plumber hooks")[0]!.claim).toMatch(/Plumber/);
  });
  it("getRelevantKnowledge reads AdsEvent and never throws", async () => {
    const db = { adsEvent: { findMany: async () => [ev("optimizer_learning", { claim: "City in subject helps", level: "measured", sampleSize: 100 })] } };
    expect((await getRelevantKnowledge(db, "subject city"))[0]!.sampleSize).toBe(100);
    expect(await getRelevantKnowledge({ adsEvent: { findMany: async () => { throw new Error("db"); } } }, "x")).toEqual([]);
  });
});

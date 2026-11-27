import { describe, expect, it } from "vitest";
import { buildBacklog, currentBacklog, rankSignals, toSignal, validateAutoAction, type Signal } from "../backlog";
import { COMPARE_SLUGS, ENTRANTS, buildCompetitiveData, positioning, renderCompetitiveMarkdown, scoreEntrant, validateEntrants } from "../competitive";
import { computeDeliveryEcon, planMargin, stripeFeeCents } from "../delivery-econ";
import { blastRadius, buildReliabilitySnapshot, clampSlo, detectOutages, evaluateSlo, failureRates, percentile, stuckJobs, type AdRow, type JobRow, type RunRow } from "../reliability";

const now = new Date("2026-11-26T12:00:00Z");
const min = (m: number) => new Date(now.getTime() - m * 60_000);
const job = (o: Partial<JobRow> = {}): JobRow => ({ id: Math.random().toString(36), type: "render_static", runId: "r1", workspaceId: "w1", status: "succeeded", attempts: 1, maxAttempts: 3, lockedAt: null, createdAt: min(120), finishedAt: min(100), durationMs: 1000, costMicros: 0, lastError: null, ...o });
const run = (o: Partial<RunRow> = {}): RunRow => ({ id: "r1", workspaceId: "w1", status: "completed", isTrial: false, kind: "standard", staticCount: 10, createdAt: min(200), confirmedAt: min(60), firstAdAt: min(58), completedAt: min(55), costMicros: 0, creditsCharged: 0, ...o });
const ads = (runId: string, n: number, status = "ready"): AdRow[] => Array.from({ length: n }, () => ({ runId, workspaceId: "w1", kind: "static", status, template: "bold", costMicros: 0 }));

describe("reliability", () => {
  it("percentile", () => { expect(percentile([], 50)).toBeNull(); expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9); });
  it("failure rates sort worst first", () => {
    const r = failureRates([job({ type: "qc" }), job({ type: "qc", status: "dead" }), job({ type: "plan" })], (j) => j.type);
    expect(r[0]).toMatchObject({ key: "qc", n: 2, failed: 1, rate: 0.5 });
  });
  it("finds zombies and stuck queue", () => {
    const s = stuckJobs([job({ status: "running", lockedAt: min(40) }), job({ status: "running", lockedAt: min(2) }), job({ status: "queued", runAt: min(30) })], now);
    expect(s.zombies).toHaveLength(1); expect(s.stuckQueued).toHaveLength(1);
  });
  it("detects an outage only on a sharp recent spike, as guidance", () => {
    const recent = Array.from({ length: 6 }, () => job({ status: "dead", finishedAt: min(5), result: { provider: "mimo" } }));
    const base = Array.from({ length: 20 }, () => job({ finishedAt: min(300), result: { provider: "mimo" } }));
    const o = detectOutages([...recent, ...base], now);
    expect(o).toHaveLength(1); expect(o[0]?.guidance).toMatch(/Read-only/);
    expect(detectOutages(base, now)).toHaveLength(0);
  });
  it("flags a workspace dominating the queue", () => {
    const j = [...Array.from({ length: 6 }, () => job({ status: "queued", workspaceId: "big" })), job({ status: "queued", workspaceId: "small" })];
    expect(blastRadius(j)).toMatchObject({ topWorkspace: "big", flagged: true });
    expect(blastRadius([job({ status: "queued", workspaceId: "a" }), job({ status: "queued", workspaceId: "b" })]).flagged).toBe(false);
  });
  it("SLO: needs a sample, then counts packs with >=8 ads in 10 minutes", () => {
    const runs = Array.from({ length: 10 }, (_, i) => run({ id: `r${i}` }));
    const all = runs.flatMap((r) => ads(r.id, 10));
    expect(evaluateSlo(runs, all)).toMatchObject({ sample: 10, ok: 10, breached: false });
    expect(evaluateSlo(runs.slice(0, 3), all).insufficient).toBe(true);
    const bad = [...runs.slice(0, 8), run({ id: "slow", completedAt: min(30) }), run({ id: "short" })];
    const adsBad = [...runs.slice(0, 8).flatMap((r) => ads(r.id, 10)), ...ads("slow", 10), ...ads("short", 3)];
    expect(evaluateSlo(bad, adsBad)).toMatchObject({ ok: 8, slowRuns: 1, shortRuns: 1, breached: true });
  });
  it("snapshot emits a severity-3 finding on breach", () => {
    const runs = Array.from({ length: 10 }, (_, i) => run({ id: `r${i}`, status: i < 5 ? "failed" : "completed" }));
    const snap = buildReliabilitySnapshot({ now, windowDays: 7, jobs: [], runs, ads: runs.flatMap((r) => ads(r.id, 10)) });
    expect(snap.findings.some((f) => f.kind === "slo_breach" && f.severity === 3)).toBe(true);
  });
  it("clamps SLO thresholds into bounds", () => { expect(clampSlo({ target: 0.5, packWithinMs: 1e9 })).toMatchObject({ target: 0.9, packWithinMs: 20 * 60_000 }); });
});

describe("delivery economics", () => {
  it("margin after Stripe fees", () => {
    expect(stripeFeeCents(9700)).toBe(311);
    expect(planMargin(900, 3, null, 1).margin).toBeNull();
    const m = planMargin(10000, 10, 1, 1).margin ?? 0;
    expect(m).toBeCloseTo((100 - 3.2 - 10) / 100, 5);
  });
  it("computes per-pack/per-credit cost, hotspots and proposals", () => {
    const e = computeDeliveryEcon({ now, windowDays: 30,
      runs: [{ id: "a", kind: "standard", isTrial: false, status: "completed", costMicros: 2_000_000, creditsCharged: 10, readyStatics: 10, readyMotion: 0 }, { id: "f", kind: "standard", isTrial: true, status: "completed", costMicros: 1_000_000, creditsCharged: 0, readyStatics: 10, readyMotion: 0 }],
      ads: [{ runId: "a", kind: "static", template: "bold", status: "ready", costMicros: 200_000 }],
      jobs: [{ type: "render_static", status: "succeeded", attempts: 2, costMicros: 1_500_000 }, { type: "qc", status: "succeeded", attempts: 1, costMicros: 100_000 }] });
    expect(e.costPerCreditUsd).toBeCloseTo(0.2); expect(e.freePackAcquisitionCostUsd).toBeCloseTo(1);
    expect(e.hotspots[0]?.key).toBe("render_static");
    expect(e.proposals.every((p) => p.ownerDecision.length > 0)).toBe(true);
    expect(e.margins.find((m) => m.key === "unlock_pack")?.marginAllUsed).not.toBeNull();
  });
  it("no data = no invented margins", () => {
    const e = computeDeliveryEcon({ now, windowDays: 30, runs: [], ads: [], jobs: [] });
    expect(e.confidence).toBe("none"); expect(e.margins.every((m) => m.marginAllUsed === null)).toBe(true);
  });
});

describe("competitive scorecard", () => {
  it("every score has a URL + checked date; compare slugs are all entrants", () => {
    expect(validateEntrants(ENTRANTS)).toEqual([]);
    for (const s of COMPARE_SLUGS) expect(ENTRANTS.some((e) => e.slug === s)).toBe(true);
  });
  it("rejects an unevidenced score", () => {
    const bad = structuredClone(ENTRANTS); bad[1]!.scores.price = { score: 3, evidence: [] };
    expect(validateEntrants(bad).length).toBeGreaterThan(0);
  });
  it("unverified entrants are not scored; coverage shown", () => {
    const c = ENTRANTS.find((e) => e.slug === "pencil")!;
    expect(scoreEntrant(c)).toMatchObject({ total: null, coverage: 0 });
  });
  it("is honest about where alternatives win and renders", () => {
    expect(positioning().theyWin.some((x) => /Entry price/.test(x))).toBe(true);
    const md = renderCompetitiveMarkdown(buildCompetitiveData("2026-11-26"));
    expect(md).toMatch(/Where alternatives win/); expect(md).toMatch(/n\/v/);
  });
});

describe("product loop", () => {
  const sig = (o: Partial<Signal>): Signal => ({ id: "a", source: "s", title: "t", detail: "", customersAffected: 1, severity: 3, commercial: 3, effort: 3, at: now.toISOString(), ...o });
  it("ranks customers x severity x commercial / effort", () => {
    const r = rankSignals([sig({ id: "x", customersAffected: 2 }), sig({ id: "y", customersAffected: 6, effort: 3 }), sig({ id: "z", customersAffected: 6, effort: 1 })]);
    expect(r.map((x) => x.id)).toEqual(["z", "y", "x"]);
  });
  it("boosts the #1 constraint", () => {
    const r = rankSignals([sig({ id: "a", area: "other" }), sig({ id: "b", area: "activation" })], "activation");
    expect(r[0]?.id).toBe("b"); expect(r[0]?.boosted).toBe(true);
  });
  it("allow-list: only read-only flags ON and bounded thresholds", () => {
    expect(validateAutoAction({ kind: "set_flag", key: "sys_reliability", enabled: true }).ok).toBe(true);
    for (const k of ["sys_winback", "sys_team_ops", "meta_publish", "team_ops_kill"]) expect(validateAutoAction({ kind: "set_flag", key: k, enabled: true }).ok).toBe(false);
    expect(validateAutoAction({ kind: "set_flag", key: "sys_reliability", enabled: false }).ok).toBe(false);
    expect(validateAutoAction({ kind: "set_threshold", key: "slo.target", value: 0.95 }).ok).toBe(true);
    expect(validateAutoAction({ kind: "set_threshold", key: "slo.target", value: 0.5 }).ok).toBe(false);
    expect(validateAutoAction({ kind: "set_threshold", key: "price.cents", value: 1 }).ok).toBe(false);
    expect(validateAutoAction({ kind: "activate_copy_variant", variantId: "v1" }).ok).toBe(false);
    expect(validateAutoAction({ kind: "activate_copy_variant", variantId: "v1" }, { validatedVariantIds: ["v1"] }).ok).toBe(true);
    expect(validateAutoAction({ kind: "run_sql", q: "drop" }).ok).toBe(false);
  });
  it("buildBacklog drops unknown ids, recomputes the score, rejects bad actions", () => {
    const ranked = rankSignals([sig({ id: "a", customersAffected: 4 })]);
    const rows = buildBacklog(ranked, { items: [{ signalIds: ["a", "ghost"], title: "Fix", why: "w", effort: 2, action: { kind: "set_flag", key: "sys_winback", enabled: true } }, { signalIds: ["ghost"], title: "Nope", why: "", effort: 1 }], whatToBuildNext: "x" }, now);
    const fix = rows.find((r) => r.title === "Fix");
    expect(rows.some((r) => r.title === "Nope")).toBe(false);
    expect(fix?.score).toBe(Math.round(((4 * 3 * 3) / 2) * 100) / 100);
    expect(fix?.autoAction).toBeNull(); expect(fix?.autoActionRejected).toMatch(/not auto-settable/);
  });
  it("latest event per id wins and keeps evidence", () => {
    const e = (status: string, t: number) => ({ name: "product_backlog", createdAt: new Date(t), props: { id: "pb:1", title: "T", status, score: 5, evidence: ["e"] } });
    const b = currentBacklog([e("approved", 2), e("proposed", 1)]);
    expect(b[0]).toMatchObject({ status: "approved", evidence: ["e"] });
  });
  it("maps customer_success_finding events tolerantly", () => {
    const s = toSignal({ name: "customer_success_finding", createdAt: now, props: { cause: "download_failed", label: "Can't download", count: 4, severity: "high", ourBug: true } });
    expect(s).toMatchObject({ customersAffected: 4, severity: 4, area: "reliability" });
    expect(toSignal({ name: "unknown_thing", createdAt: now, props: {} })).toBeNull();
  });
});

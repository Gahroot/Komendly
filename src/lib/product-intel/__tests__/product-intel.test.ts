import { describe, expect, it } from "vitest";
import { scorePackPure, checkCopy, type AdCopy, type ImageMetrics } from "../creative";
import { aggregateFindings, proposalsFromFindings, type ScoreRow } from "../findings";
import { buildLedger, classifyHook, hookLibrary, type PerfRow } from "../effectiveness";
import { alertEmail, evaluateOutcome, failureDedupeKey, type OutcomeInput } from "../outcomes";
import { critiqueToIssues } from "../critique";

const ctx = { trade: "plumber", city: "Austin", offer: "free drain inspection", brandName: "Acme", hasLogo: true };
const ad = (o: Partial<AdCopy> = {}): AdCopy => ({ id: "a1", index: 0, kind: "static", angle: "a", hook: "h", headline: "Austin plumber? Free drain inspection", body: "Book today", cta: "Book your inspection", claimCount: 1, template: "t1", ...o });
const good: ImageMetrics = { width: 1080, height: 1350, lumaRange: 160, lumaStd: 50, marginInk: 0.02, brandColorShare: 0.2, hash: "ffff0000ffff0000" };

describe("copy checks", () => {
  it("passes a clean ad", () => expect(checkCopy(ad(), ctx)).toEqual([]));
  it("flags promises, weak CTA, missing call-out", () => {
    const codes = checkCopy(ad({ headline: "We guarantee double the leads", cta: "Learn more" }), ctx).map((i) => i.code);
    expect(codes).toContain("banned_claim");
    expect(codes).toContain("cta_weak");
    expect(codes).toContain("no_callout");
  });
  it("flags numbers without a sourced claim", () => expect(checkCopy(ad({ headline: "Austin plumber, 40% off", claimCount: 0 }), ctx).map((i) => i.code)).toContain("number_without_source"));
});
describe("pack scoring", () => {
  it("detects duplicate images and empty renders", () => {
    const p = scorePackPure("r1", [{ copy: ad({ id: "a", index: 0 }), metrics: good }, { copy: ad({ id: "b", index: 1, headline: "Your Austin pipes need a look" }), metrics: good }, { copy: ad({ id: "c", index: 2, headline: "Plumber in Austin for you" }), metrics: { ...good, lumaStd: 3, hash: "0000ffff0000ffff" } }], ctx);
    expect(p.ads[0].issues.map((i) => i.code)).toContain("duplicate_image");
    expect(p.ads[2].issues.map((i) => i.code)).toContain("empty_image");
    expect(p.ads[2].score).toBeLessThan(p.ads[1].score + 1);
  });
  it("marks missing images without failing the pack", () => expect(scorePackPure("r", [{ copy: ad(), metrics: null }], ctx).ads[0].issues[0].code).toBe("image_unavailable"));
});
describe("critique", () => {
  it("turns low ratings into issues", () => {
    const r = critiqueToIssues({ adId: "a", callout: 1, value: 4, cta: 5, likelihood: 2, effort: 3, firstFiveSeconds: 4, problem: "vague", fix: "name the buyer" });
    expect(r.issues.map((i) => i.code)).toEqual(["ai_callout", "ai_likelihood"]);
    expect(r.rubric).toBeGreaterThan(40);
  });
});
describe("findings", () => {
  const rows: ScoreRow[] = Array.from({ length: 6 }, (_, k) => ({ runId: `r${k}`, trade: k < 4 ? "roofer" : "plumber", template: "t", model: "codex", promptVersion: null, packScore: 70, packIssues: [], ads: [0, 1].map((j) => ({ adId: `${k}${j}`, score: 70, issues: k < 4 ? [{ code: "no_callout", severity: "medium" as const, detail: "x" }] : [] })) }));
  it("finds systematic causes and maps to proposals only", () => {
    const f = aggregateFindings(rows);
    expect(f.some((x) => x.cause === "no_callout" && x.dimension === "trade" && x.key === "roofer")).toBe(true);
    const p = proposalsFromFindings(f);
    expect(p[0].status).toBe("proposed");
    expect(p[0].change).toMatch(/Plan prompt/);
  });
  it("needs enough ads", () => expect(aggregateFindings(rows.slice(0, 1))).toEqual([]));
});
describe("effectiveness ledger", () => {
  it("says plainly when nothing has delivered", () => {
    const l = buildLedger([]);
    expect(l.hasLiveData).toBe(false);
    expect(l.statement).toMatch(/No customer ads have delivered/);
    expect(hookLibrary(l)).toEqual([]);
  });
  it("labels thin data insufficient and big data measured", () => {
    const row = (id: string, hook: string, imp: number, clicks: number): PerfRow => ({ adId: id, trade: "roofer", angle: id, hook, headline: hook, format: "4:5", offer: null, template: null, impressions: imp, clicks, leads: 1, spendMinor: 1000 });
    const l = buildLedger([row("a", "Roof leaking?", 2000, 80), row("b", "Roof leaking again?", 1500, 60), row("c", "We fix roofs", 100, 1)]);
    expect(l.entries.find((e) => e.attribute === "hookType" && e.value === "question")!.confidence).toBe("measured");
    expect(l.entries.find((e) => e.attribute === "hookType" && e.value === "statement")!.confidence).toBe("insufficient");
    expect(hookLibrary(l).map((h) => h.value)).toContain("question");
  });
  it("classifies hooks", () => expect(classifyHook("Tired of leaks")).toBe("pain"));
});
describe("outcomes", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const base = (o: Partial<OutcomeInput> = {}): OutcomeInput => ({ now, runs: [], events: [], publishes: [], perf: [], leads: [], ...o });
  const run = (o = {}) => ({ id: "r1", status: "completed", isTrial: true, createdAt: new Date("2026-11-20T10:00:00Z"), completedAt: new Date("2026-11-20T10:10:00Z"), error: null, ready: 10, ...o });
  it("unknown with no pack", () => expect(evaluateOutcome(base()).health).toBe("unknown"));
  it("too early right after finishing", () => {
    const o = evaluateOutcome(base({ runs: [run({ completedAt: new Date("2026-11-26T08:00:00Z"), createdAt: new Date("2026-11-26T07:50:00Z") })] }));
    expect(o.health).toBe("unknown");
    expect(o.tooEarly).toBe(true);
  });
  it("failed pack is a high failure", () => {
    const o = evaluateOutcome(base({ runs: [run({ status: "failed", completedAt: null, error: "boom" })] }));
    expect(o.health).toBe("failed");
    expect(o.failures[0].code).toBe("pack_failed");
  });
  it("zero delivery after 3 days and Meta rejection", () => {
    const pub = [{ id: "p", status: "published", createdAt: new Date("2026-11-20T00:00:00Z"), error: null }];
    expect(evaluateOutcome(base({ runs: [run()], publishes: pub })).failures.map((f) => f.code)).toContain("zero_delivery_3d");
    const rej = evaluateOutcome(base({ runs: [run()], publishes: pub, perf: [{ day: "2026-11-22", impressions: 0, clicks: 0, leads: 0, spendMinor: 0, status: "DISAPPROVED" }] }));
    expect(rej.failures.map((f) => f.code)).toContain("meta_rejected");
  });
  it("spend without leads, and leads on track; lead_contacted is not tracked", () => {
    const perf = (leads: number) => [{ day: "2026-11-10", impressions: 1000, clicks: 20, leads, spendMinor: 6000, status: "ACTIVE" }];
    expect(evaluateOutcome(base({ runs: [run()], perf: perf(0) })).failures.map((f) => f.code)).toContain("spend_no_leads");
    const ok = evaluateOutcome(base({ runs: [run()], perf: perf(2) }));
    expect(ok.health).toBe("on_track");
    expect(ok.tiers.find((t) => t.key === "lead_contacted")!.state).toBe("not_tracked");
    expect(ok.tiers.find((t) => t.key === "first_lead")!.state).toBe("reached");
  });
  it("dedupe key and email are stable", () => {
    expect(failureDedupeKey("w", { code: "pack_failed", ref: "r1" })).toBe("w:pack_failed:r1");
    expect(alertEmail([{ workspaceId: "w", workspaceName: "Acme", email: null, failure: { code: "pack_failed", severity: "high", reason: "x", ref: "r", since: "" } }], "https://x.com/").text).toContain("https://x.com/admin/ads/outcomes");
  });
});

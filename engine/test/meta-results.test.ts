import { describe, expect, it } from "vitest";
import { gatedResultsBlock, resultsFacts } from "../src/growth/meta-results";
import type { ResultsReport } from "../../src/lib/ads/results/insights";

const report: ResultsReport = {
  since: "2026-11-14", until: "2026-11-20", currency: "USD",
  totals: { spend: 70, impressions: 6000, clicks: 80, results: 3 },
  ads: [{ key: "a1", label: "Spring roof check", spend: 50, impressions: 4000, clicks: 60, results: 3 }, { key: "a2", label: "Storm check", spend: 20, impressions: 2000, clicks: 20, results: 0 }],
  kept: ["Spring roof check"], swapped: ["Storm check"], added: [],
};

describe("meta results gate", () => {
  it("puts the exact numbers in facts", () => {
    const f = resultsFacts(report);
    expect(f).toContain('"spend":70');
    expect(f).toContain("$23.33");
  });
  it("uses the full block when approved", async () => {
    const seen: string[] = [];
    const r = await gatedResultsBlock(async (i) => { seen.push(i.itemKey); return { approved: true, content: i.content }; }, report, "k");
    expect(r.gated).toBe("full");
    expect(r.paragraphs.join(" ")).toContain("Swapped out this week");
    expect(seen).toEqual(["k:full"]);
  });
  it("falls back to the numbers-only block, then to nothing", async () => {
    const r = await gatedResultsBlock(async (i) => ({ approved: i.itemKey.endsWith(":numbers"), content: i.content }), report, "k");
    expect(r.gated).toBe("numbers");
    expect(r.paragraphs).toHaveLength(2);
    expect(r.paragraphs.join(" ")).not.toContain("Swapped");
    expect(await gatedResultsBlock(async () => ({ approved: false, content: null }), report, "k")).toEqual({ paragraphs: [], gated: null });
  });
});

describe("team weekly report (Codex-only polish)", async () => {
  const { codexOnly, teamReportBlock } = await import("../src/growth/meta-results");
  const { buildTeamReport, reportWindow, teamReportParagraphs } = await import("../../src/lib/ads/team/report");
  type P = import("../src/providers/types").AIProvider;
  const team = buildTeamReport({
    window: reportWindow("2026-11-23"),
    mandate: { state: "live", monthlyLimitMinor: 600_00, currency: "USD" },
    days: [{ metaAdId: "m1", adId: "a1", day: "2026-11-17", spendMinor: 140_00, impressions: 5000, clicks: 50, leads: 7 }],
    leadDays: ["2026-11-17"], actions: [],
  });
  const fixed = teamReportParagraphs(team);
  const provider = (name: "codex" | "openai", reply: (prompt: string) => unknown, extra: object = {}) => {
    const calls: string[] = [];
    const p = { name, calls, text: async (r: { prompt: string; model?: string }) => { calls.push(r.model ?? ""); return { text: "", json: reply(r.prompt), usage: { costMicros: 0, latencyMs: 1 } }; }, image: async () => { throw new Error("no"); }, health: async () => ({ ok: true }), ...extra };
    return p as unknown as P & { calls: string[] };
  };
  const approve = async () => ({ approved: true, content: null });

  it("non-Codex provider: no AI call at all, deterministic text", async () => {
    const openai = provider("openai", () => ({ paragraphs: ["x", "y"] }));
    expect(codexOnly(openai)).toBeNull();
    expect(codexOnly(null)).toBeNull();
    const b = await teamReportBlock(team, { codex: codexOnly(openai), gate: approve, itemKey: "k" });
    expect(b).toMatchObject({ paragraphs: fixed, source: "fixed" });
    expect(openai.calls).toEqual([]);
  });
  it("Codex wording is used only with identical numbers and an approved gate", async () => {
    const reworded = fixed.map((p) => `Hey! ${p}`);
    const ok = await teamReportBlock(team, { codex: codexOnly(provider("codex", () => ({ paragraphs: reworded }))), gate: approve, itemKey: "k" });
    expect(ok).toEqual({ paragraphs: reworded, source: "ai" });
    const changed = fixed.map((p) => p.replace("$140", "$150"));
    const bad = await teamReportBlock(team, { codex: codexOnly(provider("codex", () => ({ paragraphs: changed }))), gate: approve, itemKey: "k" });
    expect(bad).toMatchObject({ paragraphs: fixed, source: "fixed", reason: "numbers changed" });
    const rejected = await teamReportBlock(team, { codex: codexOnly(provider("codex", () => ({ paragraphs: reworded }))), gate: async () => ({ approved: false, content: null }), itemKey: "k" });
    expect(rejected).toMatchObject({ paragraphs: fixed, source: "fixed" });
  });
  it("Codex failure falls back to the deterministic text", async () => {
    const broken = provider("codex", () => { throw new Error("codex down"); });
    const b = await teamReportBlock(team, { codex: codexOnly(broken), gate: approve, itemKey: "k" });
    expect(b).toMatchObject({ paragraphs: fixed, source: "fixed" });
  });
  it("bypasses a MiMo text wrapper: uses the Codex fallbackText, never the wrapped text", async () => {
    const codexCalls: string[] = [];
    const mimo = provider("codex", () => { throw new Error("mimo must not be called"); }, {
      fallbackText: async (r: { model?: string }) => { codexCalls.push(r.model ?? ""); return { text: "", json: { paragraphs: fixed }, usage: { costMicros: 0, latencyMs: 1 } }; },
    });
    const b = await teamReportBlock(team, { codex: codexOnly(mimo, {}), gate: approve, itemKey: "k" });
    expect(b.source).toBe("ai");
    expect(mimo.calls).toEqual([]);
    expect(codexCalls[0]).toBe("gpt-6-luna");
  });
});

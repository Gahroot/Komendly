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

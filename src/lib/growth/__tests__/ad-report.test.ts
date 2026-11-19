import { describe, expect, it } from "vitest";
import { MIN_INDEXABLE_SITES, buildAdReport, colorFamily, hasOffer, hasPrice, normDomain, reportCsv, selectRuns, type ReportRunInput } from "@/lib/growth/ad-report";

const ad = (headline: string, hook = "I keep putting it off.", cta: string | null = "Book now") => ({ headline, hook, cta, awareness: "problem_aware", ratios: ["4:5", "preview"] });
const run = (i: number, over: Partial<ReportRunInput> = {}): ReportRunInput => ({
  id: `r${i}`, kind: "gift", domain: `site${i}.com`, ownerInternal: true, completedAt: new Date(Date.UTC(2026, 10, 1 + (i % 20))), goal: "leads",
  colors: [{ hex: "#2c55d1", role: "primary" }], ads: [ad("Want tattoo privacy?"), ad("Save 20% on your first clean", "Your ducts need love", "Book a visit")], ...over,
});

describe("selectRuns", () => {
  it("keeps gift runs, drops internal standard runs, bad domains and empty runs, dedupes by domain (latest)", () => {
    const kept = selectRuns([
      run(1), run(2, { kind: "standard", ownerInternal: true }), run(3, { kind: "standard", ownerInternal: false }),
      run(4, { domain: "www.komendly.com" }), run(5, { domain: "shop.test" }), run(6, { ads: [] }),
      run(7, { domain: "https://www.site1.com/x", completedAt: new Date("2026-12-01") }),
    ]);
    expect(kept.map((r) => r.id).sort()).toEqual(["r3", "r7"]);
  });
  it("normalises domains", () => {
    expect(normDomain("https://www.Foo.com/bar")).toBe("foo.com");
    expect(normDomain("nodot")).toBeNull();
  });
});

describe("feature detectors", () => {
  it("detects prices, offers and colours", () => {
    expect(hasPrice("Only $49 today")).toBe(true);
    expect(hasPrice("Since 1998")).toBe(false);
    expect(hasOffer("Get a free estimate")).toBe(true);
    expect(hasOffer("Custom pools")).toBe(false);
    expect(colorFamily("#2c55d1")).toBe("blue");
    expect(colorFamily("#000000")).toBe("black");
    expect(colorFamily("#ffffff")).toBe("white");
    expect(colorFamily("#fb0606")).toBe("red");
    expect(colorFamily("nope")).toBeNull();
  });
});

describe("buildAdReport", () => {
  it("aggregates and only becomes indexable at the minimum sample", () => {
    const small = buildAdReport([run(1), run(2)]);
    expect(small.sites).toBe(2);
    expect(small.ads).toBe(4);
    expect(small.indexable).toBe(false);
    expect(small.headline.question).toBe(50);
    expect(small.headline.offer).toBe(50);
    expect(small.topColorFamily).toBe("blue");
    expect(small.topRatio).toBe("4:5");
    expect(small.topRatioShare).toBe(100);
    // phrases on fewer than 3 sites are hidden (anonymity)
    expect(small.tables.find((t) => t.id === "cta_phrases")!.rows).toEqual([]);
    const big = buildAdReport(Array.from({ length: MIN_INDEXABLE_SITES }, (_, i) => run(i)));
    expect(big.indexable).toBe(true);
    expect(big.tables.find((t) => t.id === "cta_phrases")!.rows[0]).toEqual(["book a visit", MIN_INDEXABLE_SITES, MIN_INDEXABLE_SITES]);
    expect(big.cta.topVerb).toBe("book");
    expect(big.cta.topVerbShare).toBe(100);
  });
  it("exports every table as CSV with quoting", () => {
    const r = buildAdReport([run(1), run(2), run(3)]);
    const csv = reportCsv(r, "https://x/y");
    expect(csv.split("\n")[0]).toBe("table,column_1,column_2,column_3,column_4");
    expect(csv).toContain("sample,websites,3,ads,6");
    expect(csv).toContain('headline_features,"Mentions an offer (free, % off, discount, deal)",50%');
  });
});

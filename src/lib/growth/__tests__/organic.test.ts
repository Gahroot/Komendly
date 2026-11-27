import { describe, expect, it, vi } from "vitest";

// The sitemap loaders read Postgres; stub them so this test is offline and fast.
vi.mock("@/lib/growth/industry-examples-server", () => ({ loadIndexableIndustryLinks: async () => [] }));
vi.mock("@/lib/growth/ad-pages-server", () => ({ loadAllGalleryPageStates: async () => [] }));
vi.mock("@/lib/growth/ad-report-server", () => ({ loadAdReport: async () => ({ indexable: false, to: null }) }));

import { existsSync } from "node:fs";
import { SIZE_PRESETS, cropLoss, fitRect, presetFilename } from "../organic/sizes";
import { discountMath, generateOffers, OFFER_GOALS } from "../organic/offers";
import { buildCalendar, calendarCsv, calendarIcs, nthWeekday } from "../organic/calendar";
import { COPY_LIBRARY } from "../organic/copy-library";
import { buildInspirationIndex, searchInspiration } from "../organic/inspiration";
import { buildPlan } from "../organic/playbook-quiz";
import { allTemplatePaths } from "../organic/templates";
import { COMPETITORS, alternativesPath, comparePath, slugFromParam, komendlyFacts } from "../organic/compare";
import { benchmarkTrades, tradeBenchmark } from "../organic/benchmarks";
import { RESOURCE_TOOLS, organicCtaHref, organicPaths } from "../organic/registry";
import { organicLlmsLines } from "../organic/llms";
import { ADLIB_SNAPSHOT } from "../adlib-report-server";
import { PLAYBOOKS } from "../trade-playbooks-data";
import sitemap from "../../../app/sitemap";

describe("resizer maths", () => {
  it("covers or contains and centres", () => {
    expect(fitRect(2000, 1000, 1000, 1000, "cover")).toEqual({ dx: -500, dy: 0, dw: 2000, dh: 1000 });
    expect(fitRect(2000, 1000, 1000, 1000, "contain")).toEqual({ dx: 0, dy: 250, dw: 1000, dh: 500 });
    expect(cropLoss(2000, 1000, 1000, 1000)).toBeCloseTo(0.5);
    expect(cropLoss(1000, 1000, 500, 500)).toBe(0);
    expect(() => fitRect(0, 1, 1, 1, "cover")).toThrow();
  });
  it("preset ids are unique and filenames are safe", () => {
    expect(new Set(SIZE_PRESETS.map((p) => p.id)).size).toBe(SIZE_PRESETS.length);
    expect(presetFilename("My Photo.JPG", SIZE_PRESETS[0]!, "jpg")).toBe("my-photo-meta-square-1080x1080.jpg");
  });
});

describe("offers", () => {
  it("every trade and goal yields ideas with placeholders, never invented numbers", () => {
    for (const p of PLAYBOOKS) for (const g of OFFER_GOALS) {
      const o = generateOffers(p.slug, g.id);
      expect(o.length).toBeGreaterThan(1);
      for (const x of o.filter((y) => !y.id.startsWith("common"))) expect(x.line).toContain("[");
    }
    expect(generateOffers("nope", "win-back")).toEqual([]);
  });
  it("discount maths", () => {
    expect(discountMath(100, 60, 10)).toMatchObject({ normalProfit: 40, discountedProfit: 30, extraSalesNeededPct: 33.3, viable: true });
    expect(discountMath(100, 60, 40).viable).toBe(false);
    expect(discountMath(0, 0, 10).viable).toBe(false);
  });
});

describe("calendar", () => {
  it("computes US holidays", () => {
    expect(nthWeekday(2027, 5, 0, 2).toISOString().slice(0, 10)).toBe("2027-05-09");
    const bf = buildCalendar("roofers", 2026).find((e) => e.key === "black-friday")!;
    expect(bf.date).toBe("2026-11-27");
    expect(bf.startAds < bf.date).toBe(true);
  });
  it("exports CSV and ICS", () => {
    const ev = buildCalendar("hvac", 2027);
    expect(ev.length).toBe(11);
    expect(calendarCsv(ev).split("\r\n")[0]).toContain("Start ads on");
    const ics = calendarIcs(ev, "HVAC");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBe(11);
    expect(buildCalendar("nope", 2027)).toEqual([]);
  });
});

describe("copy library and inspiration", () => {
  it("headlines are short and honest", () => {
    for (const c of COPY_LIBRARY) {
      expect(PLAYBOOKS.some((p) => p.slug === c.slug)).toBe(true);
      expect(c.headlines.length).toBeGreaterThanOrEqual(6);
      for (const h of c.headlines) expect(h.text.length).toBeLessThanOrEqual(40);
      const all = [...c.headlines.map((h) => h.text), ...c.primaryTexts].join(" ");
      expect(all).not.toMatch(/guarante|\d+%|#1|best in/i);
    }
  });
  it("search filters by words, kind and category", () => {
    const idx = buildInspirationIndex();
    expect(new Set(idx.map((i) => i.id)).size).toBe(idx.length);
    const r = searchInspiration(idx, { q: "roof", kind: "headline" });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.kind === "headline")).toBe(true);
    expect(searchInspiration(idx, { q: "zzzzqqq" })).toEqual([]);
    expect(searchInspiration(idx, { category: "auto" }).every((i) => i.category === "auto")).toBe(true);
  });
});

describe("playbook quiz", () => {
  it("adapts the plan to the answers", () => {
    const base = { trade: "roofers", goal: "calls", budget: "none", hasWebsite: false, reviews: "none", hoursPerWeek: 1 } as const;
    const p = buildPlan(base);
    expect(p.steps.some((s) => s.href === "/tools/ad-image-resizer")).toBe(false);
    expect(p.steps.some((s) => s.title.includes("website") || s.title.includes("page"))).toBe(true);
    expect(p.steps.at(-1)!.href).toBe("/free-ads");
    const q = buildPlan({ ...base, budget: "medium", hasWebsite: true, reviews: "many", hoursPerWeek: 6 });
    expect(q.steps.some((s) => s.href === "/ad-copy-library/roofers")).toBe(true);
    expect(q.testBudget).toMatch(/starting|test|\$/i);
  });
});

describe("templates", () => {
  it("every template file exists in public/", () => {
    expect(allTemplatePaths().length).toBe(12);
    for (const p of allTemplatePaths()) expect(existsSync(`public${p}`)).toBe(true);
  });
});

describe("comparisons", () => {
  it("every fact has an https source and a verified-date policy; slugs round-trip", () => {
    for (const c of COMPETITORS) {
      expect(c.facts.length).toBeGreaterThan(1);
      for (const f of c.facts) expect(f.source).toMatch(/^https:\/\//);
      expect(c.chooseThemWhen.length).toBeGreaterThan(0);
      expect(slugFromParam(comparePath(c).split("/").pop()!, "compare")).toBe(c.slug);
      expect(slugFromParam(alternativesPath(c).split("/").pop()!, "alternatives")).toBe(c.slug);
      expect(JSON.stringify(c)).not.toMatch(/scam|worst|terrible|fraud|sucks/i);
    }
    expect(komendlyFacts().join(" ")).toMatch(/free ads/);
  });
});

describe("benchmarks come only from the snapshot", () => {
  it("trade benchmarks match the report rows and respect the minimum group", () => {
    const trades = benchmarkTrades(ADLIB_SNAPSHOT);
    expect(trades.length).toBeGreaterThan(0);
    for (const t of trades) {
      expect(t.advertisers).toBeGreaterThanOrEqual(20);
      const b = tradeBenchmark(ADLIB_SNAPSHOT, t.slug)!;
      expect(b.trade).toBe(t);
      expect(b.medianDays.overall).toBe(ADLIB_SNAPSHOT.runDays.median);
    }
    expect(tradeBenchmark(ADLIB_SNAPSHOT, "nope")).toBeNull();
  });
});

describe("registry, llms and sitemap", () => {
  it("CTA links carry the free_tools UTM", () => {
    expect(organicCtaHref("x", "end")).toBe("/free-ads?utm_source=free_tool&utm_medium=organic&utm_campaign=x&utm_content=end");
  });
  it("tool slugs are unique and none shadows a legacy free tool", () => {
    expect(new Set(RESOURCE_TOOLS.map((t) => t.slug)).size).toBe(RESOURCE_TOOLS.length);
    for (const t of RESOURCE_TOOLS) expect(t.description.length).toBeGreaterThan(80);
  });
  it("llms.txt lists competitor ad watch and seasonal ideas", () => {
    const txt = organicLlmsLines(null).join("\n");
    expect(txt).toContain("/tools/competitor-ad-watch");
    expect(txt).toContain("/seasonal");
  });
  it("llms.txt lists every organic path", () => {
    const txt = organicLlmsLines("/reports/local-service-meta-ads").join("\n");
    for (const t of RESOURCE_TOOLS) expect(txt).toContain(`/tools/${t.slug}`);
    for (const c of COMPETITORS) expect(txt).toContain(comparePath(c));
    expect(organicLlmsLines(null).join("\n")).not.toContain("benchmarks");
  });
  it("sitemap includes the new routes", async () => {
    const urls = (await sitemap()).map((s) => s.url);
    for (const p of organicPaths()) expect(urls).toContain(`https://www.komendly.com${p}`);
  });
});

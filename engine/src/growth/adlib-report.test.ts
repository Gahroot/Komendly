import { describe, expect, it } from "vitest";
import { placeToAdlibRow } from "./adlib-report";

describe("placeToAdlibRow", () => {
  it("needs live-ad count and first-seen date (today's KlyPlace has neither)", () => {
    expect(placeToAdlibRow({ id: "x", niche: "plumbing", state: "TX", city: "Austin", name: "A", domain: "a.com", website: "https://a.com", source: "adlib" })).toBeNull();
    const r = placeToAdlibRow({ id: "x", niche: "plumbing", state: "TX", name: "A", activeAds: 2, firstSeen: new Date("2026-01-02T00:00:00Z") });
    expect(r).toMatchObject({ niche: "plumbing", state: "TX", active_ads: 2, first_seen: "2026-01-02" });
  });
});

import { gateAdlibReport } from "./adlib-report";
import { buildAdlibReport, type AdlibRow } from "../../../src/lib/growth/adlib-report";

describe("gateAdlibReport", () => {
  const rows: AdlibRow[] = Array.from({ length: 25 }, (_, i) => ({ page_url: `fb.com/p${i}`, niche: "plumbing", state: "TX", active_ads: 1, first_seen: "2026-01-01", ad_text_sample: "Free estimate on water heaters this month, book online now", library_url: `https://www.facebook.com/ads/library/?id=${i}` }));
  const report = buildAdlibReport(rows, "2026-11-20");
  it("gates the report and every leaderboard with the numbers as facts", async () => {
    const seen: string[] = [];
    const rejected = await gateAdlibReport(report, async (item) => { seen.push(item.itemKey); expect(item.facts).toContain("median"); return { approved: true, verdict: { reasons: [] } }; }, "2026-11");
    expect(rejected).toEqual([]);
    expect(seen).toEqual(["adlib:2026-11:report", "adlib:2026-11:lb:plumbers"]);
  });
  it("returns the rejections so the caller keeps last month's data", async () => {
    const rejected = await gateAdlibReport(report, async (item) => ({ approved: item.kind !== "page", verdict: { reasons: ["names a business"] } }), "2026-11");
    expect(rejected).toEqual(["adlib:2026-11:lb:plumbers: names a business"]);
  });
});

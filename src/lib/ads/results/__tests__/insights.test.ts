import { describe, expect, it } from "vitest";
import { precheck } from "../../../growth/review-gate";
import { buildResultsReport, fetchAdInsights, leadResults, parseInsightRows, parseStoredReport, resultsParagraphs, resultsText, type OurMetaAd } from "../insights";

const api = {
  data: [
    { ad_id: "m1", spend: "40.00", impressions: "3000", inline_link_clicks: "50", actions: [{ action_type: "link_click", value: "50" }, { action_type: "lead", value: "2" }, { action_type: "onsite_conversion.lead_grouped", value: "2" }], date_start: "2026-11-14", date_stop: "2026-11-20" },
    { ad_id: "m2", spend: "10.00", impressions: "1000", inline_link_clicks: "10", actions: [{ action_type: "onsite_conversion.lead_grouped", value: "1" }], date_start: "2026-11-14", date_stop: "2026-11-20" },
    { ad_id: "m3", spend: "20.00", impressions: "2000", inline_link_clicks: "20", date_start: "2026-11-14", date_stop: "2026-11-20" },
    { ad_id: "other", spend: "999", impressions: "99999", inline_link_clicks: "999", date_start: "2026-11-14", date_stop: "2026-11-20" },
  ],
};
const windowStart = new Date("2026-11-14T00:00:00Z");
const ours: OurMetaAd[] = [
  { metaAdId: "m1", key: "a1", label: "Spring roof check", publishedAt: "2026-11-01T00:00:00Z" },
  { metaAdId: "m2", key: "a1", label: "Spring roof check", publishedAt: "2026-11-01T00:00:00Z" },
  { metaAdId: "m3", key: "a2", label: "Storm damage? We look first", publishedAt: "2026-11-01T00:00:00Z" },
  { metaAdId: "m4", key: "a3", label: "Gutters before winter", publishedAt: "2026-11-17T00:00:00Z" },
];
const statuses = [
  { id: "m1", effectiveStatus: "ACTIVE", updatedTime: "2026-10-30T00:00:00+0000" },
  { id: "m2", effectiveStatus: "ACTIVE", updatedTime: "2026-10-30T00:00:00+0000" },
  { id: "m3", effectiveStatus: "PAUSED", updatedTime: "2026-11-18T00:00:00+0000" },
  { id: "m4", effectiveStatus: "ACTIVE", updatedTime: "2026-11-17T00:00:00+0000" },
];

describe("insights -> plain-English results", () => {
  it("counts one lead action type only (no double counting)", () => {
    expect(leadResults([{ action_type: "lead", value: "2" }, { action_type: "onsite_conversion.lead_grouped", value: "2" }])).toBe(2);
    expect(leadResults(undefined)).toBe(0);
  });

  it("builds totals from our ads only, grouped per Komendly ad, with kept / swapped / added", () => {
    const r = buildResultsReport({ currency: "USD", rows: parseInsightRows(api), statuses, ours, windowStart })!;
    expect(r.totals).toEqual({ spend: 70, impressions: 6000, clicks: 80, results: 3 });
    expect(r.ads.map((a) => a.key)).toEqual(["a1", "a2"]);
    expect(r.kept).toEqual(["Spring roof check"]);
    expect(r.swapped).toEqual(["Storm damage? We look first"]);
    expect(r.added).toEqual(["Gutters before winter"]);
    const t = resultsText(r);
    expect(t.headline).toBe("Nov 14 to Nov 20: your Komendly ads spent $70.00, were shown 6,000 times and got 80 link clicks (1.33% of views) and 3 leads, about $23.33 per lead.");
    expect(t.ads[0]).toBe('"Spring roof check": $50.00 spent, 4,000 views, 60 clicks (1.50%), 3 leads at $16.67 each.');
    expect(t.ads[1]).toContain("no leads");
    expect(t.changes).toEqual(['Kept running: "Spring roof check".', 'Swapped out this week: "Storm damage? We look first".', 'New this week: "Gutters before winter".']);
  });

  it("says plainly when Meta reported no leads, and never promises results", () => {
    const r = buildResultsReport({ currency: "EUR", rows: parseInsightRows({ data: [api.data[2]] }), statuses, ours, windowStart })!;
    const text = resultsParagraphs(r).join("\n");
    expect(text).toContain("Meta reported no leads from them in that time");
    expect(text).toContain("€20.00");
    expect(precheck({ system: "meta_results", kind: "report", itemKey: "t", content: text })).toEqual([]);
    expect(text).not.toMatch(/guarantee|will get|expect more/i);
  });

  it("shows nothing without insights for our ads", () => {
    expect(buildResultsReport({ currency: "USD", rows: [], statuses, ours, windowStart })).toBeNull();
    expect(buildResultsReport({ currency: "USD", rows: parseInsightRows({ data: [api.data[3]] }), statuses, ours, windowStart })).toBeNull();
    expect(resultsParagraphs(null)).toEqual([]);
    expect(parseStoredReport(null)).toBeNull();
    expect(parseStoredReport({ totals: { impressions: 0 }, ads: [], kept: [], swapped: [], added: [] })).toBeNull();
  });

  it("round-trips a stored report", () => {
    const r = buildResultsReport({ currency: "USD", rows: parseInsightRows(api), statuses, ours, windowStart });
    expect(parseStoredReport(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it("asks the Marketing API for last_7d ad-level insights filtered to our ads", async () => {
    const urls: string[] = [];
    const rows = await fetchAdInsights(async (u) => { urls.push(u); return new Response(JSON.stringify(api)); }, { token: "tok", adAccountId: "123", graphVersion: "v25.0", adIds: ["m1", "m2"] });
    expect(rows).toHaveLength(4);
    const u = new URL(urls[0]!);
    expect(u.pathname).toBe("/v25.0/act_123/insights");
    expect(u.searchParams.get("date_preset")).toBe("last_7d");
    expect(u.searchParams.get("level")).toBe("ad");
    expect(JSON.parse(u.searchParams.get("filtering")!)[0].value).toEqual(["m1", "m2"]);
    await expect(fetchAdInsights(async () => new Response(JSON.stringify({ error: { message: "no ads_read" } }), { status: 403 }), { token: "t", adAccountId: "act_1", graphVersion: "v25.0", adIds: ["m1"] })).rejects.toThrow(/no ads_read/);
  });
});

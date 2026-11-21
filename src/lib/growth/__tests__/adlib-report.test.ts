import { describe, expect, it } from "vitest";
import data from "@/lib/growth/adlib-report-data.json";
import {
  MIN_ADVERTISERS_FOR_TERM, MIN_GROUP, MIN_INDEXABLE_ADVERTISERS, adWords, adlibReportCsv, buildAdlibReport, cleanRows, editDistance, parseFirstSeen, redactExcerpt, tradeForNiche, unknownProperNouns,
  type AdlibReport, type AdlibRow,
} from "@/lib/growth/adlib-report";

const row = (i: number, over: Partial<AdlibRow> = {}): AdlibRow => ({
  page_name: `Acme${i} Plumbing`, page_url: `https://www.facebook.com/acme${i}/`, website: `https://acme${i}.com`, domain: `acme${i}.com`,
  niche: "plumbing", city: "Austin", state: "TX", active_ads: 1 + (i % 3), first_seen: "2026-05-04",
  ad_text_sample: `Free estimate on water heaters! Acme${i} Plumbing has served Austin for years. Call (512) 555-0101 or visit acme${i}.com`,
  library_url: `https://www.facebook.com/ads/library/?id=${1000 + i}`, search_term: "plumber", ...over,
});

describe("parseFirstSeen", () => {
  it("reads ISO and Ad Library dates, rejects junk", () => {
    expect(parseFirstSeen("2026-08-19")).toBe("2026-08-19");
    expect(parseFirstSeen("Jun 5, 2024")).toBe("2024-06-05");
    expect(parseFirstSeen("Sept 30, 2025")).toBe("2025-09-30");
    expect(parseFirstSeen("Feb 30, 2025")).toBeNull();
    expect(parseFirstSeen("yesterday")).toBeNull();
  });
});

describe("cleanRows", () => {
  it("dedupes by page, drops bad state/date/ads and future dates, computes days", () => {
    const cs = cleanRows([
      row(1), row(1, { page_url: "https://facebook.com/acme1" }), row(2, { state: "Texas" }), row(3, { first_seen: "soon" }),
      row(4, { active_ads: 0 }), row(5, { first_seen: "2026-12-01" }), row(6, { first_seen: "Nov 1, 2026" }),
    ], "2026-11-20");
    expect(cs.map((c) => c.row.page_name)).toEqual(["Acme1 Plumbing", "Acme6 Plumbing"]);
    expect(cs[1].days).toBe(19);
    expect(cs[0].trade.slug).toBe("plumbers");
  });
  it("maps unknown niches to a slug", () => {
    expect(tradeForNiche("Dog Walking").slug).toBe("dog-walking");
  });
});

describe("redaction", () => {
  it("removes the name, website, phone, address and city from excerpts", () => {
    const r = row(7, { ad_text_sample: "Acme7 Plumbing at 120 Main Street in Austin: call 512-555-0101, email hi@acme7.com or www.acme7.com today. Lukes rocks" });
    const x = redactExcerpt(r.ad_text_sample!, r);
    expect(x).not.toMatch(/acme7|555|Main Street|Austin/i);
    expect(x).toContain("[business]");
    expect(x).toContain("[address]");
  });
  it("keeps common trade words from the page name and trims long text", () => {
    const r = { page_name: "Lukes Towing", domain: "lukes.com", website: null, city: null };
    expect(redactExcerpt("24 hour towing by Lukes", r, 160, new Set(["towing"]))).toBe("24 hour towing by [business]");
    expect(redactExcerpt("word ".repeat(80), r, 50).length).toBeLessThanOrEqual(51);
  });
  it("redacts capitalised own-name words even when common, misspellings and domain parts", () => {
    const r = { page_name: "Ralph Garramone, Plastic Surgeon and Medi-Spa", domain: "garramone.com", website: null, city: "Fort Myers" };
    expect(redactExcerpt("Be a VIP at Garrmamone, today! Ralph says hi", r, 160, new Set(["ralph"]))).toBe("Be a VIP at [business], today! [business] says hi");
    const h = { page_name: "Helm Construction Company", domain: "helmconstructionpros.com", website: null, city: null };
    expect(redactExcerpt("Call Helm today, we build at the helm", h, 160, new Set(["helm"]))).toBe("Call [business] today, we build at the helm");
    expect(editDistance("garrmamone", "garramone")).toBe(1);
  });
  it("flags unknown capitalised words mid-sentence only", () => {
    const en = new Set(["be", "a", "at", "today", "we", "fix", "roofs", "in", "deal", "awesome", "summer", "our"]);
    expect(unknownProperNouns("Be a VIP at Zorblax today", en)).toEqual(["VIP", "Zorblax"]);
    expect(unknownProperNouns("Zorblax fixes roofs. Garrmamone here", en)).toEqual([]);
    expect(unknownProperNouns("We fix roofs in Texas with our AWESOME SUMMER Deal", en)).toEqual([]);
  });
  it("drops the advertiser's own name tokens and filler from words", () => {
    expect(adWords("Acme Plumbing offers a FREE estimate! acme.com 2024", new Set(["acme"]))).toEqual(["plumbing", "offers", "free", "estimate"]);
  });
});

describe("buildAdlibReport", () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(i, { first_seen: i < 10 ? "2025-01-01" : "2026-10-21" }));
  const r = buildAdlibReport(rows, "2026-11-20", new Date("2026-11-21T00:00:00Z"));
  it("computes medians, shares and distributions", () => {
    expect(r.advertisers).toBe(30);
    expect(r.liveAds.median).toBe(2);
    expect(r.runDays.median).toBe(30);
    expect(r.runDays.over365Share).toBe(33.3);
    expect(r.liveAds.buckets.reduce((n, b) => n + b.advertisers, 0)).toBe(30);
    expect(r.signals.rows.find((s) => s.id === "free")?.share).toBe(100);
    expect(r.media).toBeNull();
    expect(r.indexable).toBe(30 >= MIN_INDEXABLE_ADVERTISERS);
  });
  it("only publishes words used by enough advertisers and never names", () => {
    expect(r.words.rows.every((w) => w.advertisers >= MIN_ADVERTISERS_FOR_TERM)).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/acme|555-0101|facebook\.com\/acme/i);
  });
  it("hides small trades/states and builds leaderboards oldest first", () => {
    const small = buildAdlibReport([...rows, row(99, { niche: "roofing", state: "OH" })], "2026-11-20");
    expect(small.byTrade.map((t) => t.slug)).toEqual(["plumbers"]);
    expect(small.byState.map((s) => s.state)).toEqual(["TX"]);
    const lb = r.leaderboards[0];
    expect(lb.entries[0].since).toBe("2025-01-01");
    expect(lb.entries.map((e) => e.rank)).toEqual(lb.entries.map((_, i) => i + 1));
    expect(lb.indexable).toBe(true);
  });
  it("exports an aggregate CSV", () => {
    const csv = adlibReportCsv(r, "https://www.komendly.com/reports/local-service-meta-ads");
    expect(csv).toContain("by_trade,Plumbers,30");
    expect(csv).not.toMatch(/acme/i);
  });
});

describe("committed snapshot", () => {
  const snap = data as unknown as AdlibReport;
  it("is an anonymous aggregate over the full sample", () => {
    expect(snap.version).toBe(1);
    expect(snap.advertisers).toBeGreaterThanOrEqual(MIN_INDEXABLE_ADVERTISERS);
    expect(snap.byTrade.every((t) => t.advertisers >= MIN_GROUP)).toBe(true);
    expect(snap.byState.every((s) => s.advertisers >= MIN_GROUP)).toBe(true);
    const json = JSON.stringify(snap);
    expect(json).not.toMatch(/page_name|page_url|"website"|"domain"/);
    expect(snap.leaderboards.every((l) => l.entries.every((e) => /facebook\.com\/ads\/library/.test(e.libraryUrl)))).toBe(true);
  });
});

describe("published leaderboard excerpts", () => {
  it("never contain the known misspelt name", () => {
    expect(JSON.stringify(data)).not.toMatch(/garr?a?mm?one/i);
  });
});

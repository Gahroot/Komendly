import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adLibraryChallengePath, adLibraryPageUrl, adLibraryResultCount, parseAdLibraryPage, parseAdLibrarySearch, parseAdlibTarget, pickPageFromSearch } from "../adlib-scan";
import { AD_CHECK_RUBRIC, FATIGUE_DAYS, adWatchPagesFromReport, buildAdCheckReport, gateReport, gradeScan, reportSummaryLines, rivalRow } from "../ad-check";
import { precheck } from "../review-gate";

// Saved from the live Ad Library on 2026-11-21 (only the result JSON <script> tags kept).
const fx = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
const PAGE = fx("adlib-page-gator.html");
const SEARCH = fx("adlib-search-gator.html");
const GATOR = "111445424455372";
const NOW = new Date("2026-11-21T12:00:00Z");

describe("parseAdLibraryPage (Gator Metal Roofing fixture)", () => {
  const scan = parseAdLibraryPage(PAGE, GATOR, NOW);
  it("reads page identity and every live ad", () => {
    expect(scan.pageId).toBe(GATOR);
    expect(scan.pageName).toBe("Gator Metal Roofing");
    expect(scan.pageUrl).toBe("https://www.facebook.com/gatorhomeprofessionals/");
    expect(scan.website).toBe("https://roofs.gatormetalroofing.com/");
    expect(adLibraryResultCount(PAGE)).toBe(13);
    expect(scan.liveAds).toHaveLength(13);
    expect(scan.scannedAt).toBe(NOW.toISOString());
  });
  it("maps start dates, run days, formats and creative fields", () => {
    const oldest = scan.liveAds[0]!;
    expect(oldest.adArchiveId).toBe("1724564108733159");
    expect(oldest.startedAt).toBe("2026-06-12");
    expect(oldest.runDays).toBe(162);
    expect(oldest.format).toBe("image");
    expect(oldest.cta).toBe("Learn more");
    expect(oldest.body.length).toBeGreaterThan(20);
    expect(oldest.imageUrl).toMatch(/^https:\/\/scontent/);
    expect(oldest.snapshotUrl).toBe("https://www.facebook.com/ads/library/?id=1724564108733159");
    const counts = scan.liveAds.reduce<Record<string, number>>((m, a) => ({ ...m, [a.format]: (m[a.format] ?? 0) + 1 }), {});
    expect(counts).toEqual({ image: 8, video: 5 });
    expect(scan.liveAds.every((a, i, all) => i === 0 || all[i - 1]!.runDays >= a.runDays)).toBe(true);
  });
  it("never throws on junk and tells a challenge page apart", () => {
    const challenge = fx("adlib-challenge.html");
    expect(adLibraryChallengePath(challenge)).toMatch(/^\/__rd_verify_/);
    expect(adLibraryResultCount(challenge)).toBeNull();
    expect(parseAdLibraryPage(challenge, "1", NOW).liveAds).toEqual([]);
    expect(parseAdLibraryPage("<html>{\"search_results_connection\":{bad", "1", NOW).liveAds).toEqual([]);
  });
});

describe("targets and page-id resolution", () => {
  it("parses Page URLs, page ids and websites", () => {
    expect(parseAdlibTarget("facebook.com/gatorhomeprofessionals")).toMatchObject({ kind: "facebook", value: "gatorhomeprofessionals" });
    expect(parseAdlibTarget("https://www.facebook.com/GatorHomeProfessionals/?ref=x")).toMatchObject({ kind: "facebook", value: "gatorhomeprofessionals" });
    expect(parseAdlibTarget("https://www.facebook.com/profile.php?id=61553139007761")).toMatchObject({ kind: "facebook", value: "61553139007761" });
    expect(parseAdlibTarget(adLibraryPageUrl(GATOR))).toMatchObject({ kind: "page_id", value: GATOR });
    expect(parseAdlibTarget("https://www.gatormetalroofing.com/roofs")).toMatchObject({ kind: "website", value: "gatormetalroofing.com" });
    expect(parseAdlibTarget("instagram.com/x")).toBeNull();
    expect(parseAdlibTarget("facebook.com/groups/123")).toBeNull();
    expect(parseAdlibTarget("not a url")).toBeNull();
  });
  it("picks the page whose ads land on the domain / whose URL has the slug", () => {
    const res = parseAdLibrarySearch(SEARCH);
    expect(res.length).toBeGreaterThan(0);
    expect(pickPageFromSearch(res, parseAdlibTarget("gatormetalroofing.com")!)).toBe(GATOR);
    expect(pickPageFromSearch(res, parseAdlibTarget("facebook.com/gatorhomeprofessionals")!)).toBe(GATOR);
    expect(pickPageFromSearch(res, parseAdlibTarget("someoneelse.com")!)).toBeNull();
  });
});

describe("Meta Ad Check grading", () => {
  const scan = parseAdLibraryPage(PAGE, GATOR, NOW);
  it("rubric totals 100 and every point is tied to a fact", () => {
    expect(AD_CHECK_RUBRIC.reduce((n, r) => n + r.max, 0)).toBe(100);
    const g = gradeScan(scan, 13);
    expect(g.liveCount).toBe(13);
    expect(g.oldestDays).toBe(162);
    expect(g.fatigued.length).toBe(scan.liveAds.filter((a) => a.runDays > FATIGUE_DAYS).length);
    expect(g.checks.find((c) => c.id === "fatigue")!.points).toBe(0);
    expect(g.checks.find((c) => c.id === "formats")!.points).toBe(20);
    expect(g.score).toBe(20 + 20 + 0 + 15 + 20);
    for (const c of g.checks) expect(c.fact.length).toBeGreaterThan(5);
  });
  it("scores an empty page 0 and builds a gated report", () => {
    expect(gradeScan({ ...scan, liveAds: [] }, 0).score).toBe(0);
    const rival = rivalRow({ ...scan, pageId: "2", pageName: "Rival Roofing" }, 13);
    const r = buildAdCheckReport(scan, 13, [rival, rivalRow(scan)], { trade: "roofers", state: "NC" });
    expect(r.rivals).toHaveLength(1);
    const g = gateReport(r, false);
    expect(g.ads).toEqual([]);
    expect(g.rivals[0]).toEqual({ liveCount: 13, longestRunDays: 162 });
    expect(gateReport(r, true).rivals[0]!.pageName).toBe("Rival Roofing");
  });
  it("summary lines pass the deterministic precheck and name no rival", () => {
    const r = buildAdCheckReport(scan, 13, [rivalRow({ ...scan, pageId: "2", pageName: "Rival Roofing" })], { trade: "roofers", state: "NC" });
    const text = [...reportSummaryLines(r), ...r.checks.map((c) => c.fact)].join("\n");
    expect(precheck({ system: "ad_check", kind: "report", itemKey: "t", content: text })).toEqual([]);
    expect(text).not.toContain("Rival Roofing");
  });
});

describe("adWatchPagesFromReport", () => {
  const scan = { pageId: "111", pageName: "Own Co", pageUrl: "https://www.facebook.com/ownco/", liveAds: [], scannedAt: "2026-11-21T00:00:00Z" };
  const rival = { pageId: "222", pageName: "Rival Co", liveAds: [], scannedAt: "2026-11-21T00:00:00Z" };
  const report = buildAdCheckReport(scan, 0, [rivalRow(rival, 2)]);
  it("prefills the checked Page and, once unlocked, its rivals", () => {
    expect(adWatchPagesFromReport(gateReport(report, true))).toEqual(["https://www.facebook.com/ownco/", "222"]);
  });
  it("never leaks gated rival ids", () => {
    expect(adWatchPagesFromReport(gateReport(report, false))).toEqual(["https://www.facebook.com/ownco/"]);
  });
  it("falls back to the page id", () => {
    expect(adWatchPagesFromReport(gateReport(buildAdCheckReport({ ...scan, pageUrl: undefined }, 0, []), false))).toEqual(["111"]);
  });
});

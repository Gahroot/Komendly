import { describe, expect, it } from "vitest";
import { coachAccess } from "../access";
import { assessReport, finalizeVerdict } from "../assess";
import { CoachVerdictSchema, uploadKind } from "../contracts";
import { matchOwnAd } from "../match";
import { SAMPLE_VERDICT } from "../sample";
import { mapColumns, parseCsvReport, parseNumber } from "../table";

// Ads Manager "Ads" tab export, US English (default columns + Reporting starts/ends + footer total row).
const META_US = `"Reporting starts","Reporting ends","Ad name","Ad delivery","Attribution setting","Results","Result indicator","Reach","Frequency","Cost per results","Ad set budget","Ad set budget type","Amount spent (USD)","Ends","Impressions","CPM (cost per 1,000 impressions) (USD)","Link clicks","CPC (cost per link click) (USD)","CTR (link click-through rate)","Purchase ROAS (return on ad spend)"
2026-10-28,2026-11-10,"Stop losing Saturday bookings",active,"7-day click or 1-day view",41,actions:offsite_conversion.fb_pixel_lead,9120,1.71,11.40,25,Daily,467.40,Ongoing,15600,29.96,312,1.50,2.00,
2026-10-28,2026-11-10,"Meet the team video",active,"7-day click or 1-day view",7,actions:offsite_conversion.fb_pixel_lead,7010,1.84,64.29,25,Daily,450.03,Ongoing,12900,34.89,120,3.75,0.93,
2026-10-28,2026-11-10,"Spring offer 20% off",active,"7-day click or 1-day view",12,actions:offsite_conversion.fb_pixel_lead,5200,1.55,20.10,20,Daily,241.20,Ongoing,8060,29.93,170,1.42,2.11,
2026-11-08,2026-11-10,"New: gift cards",active,"7-day click or 1-day view",0,actions:offsite_conversion.fb_pixel_lead,400,1.1,,10,Daily,9.80,Ongoing,440,22.27,6,1.63,1.36,
,,"Results from 4 ads",,,60,,20000,,,,,1168.43,,37000,,608,,,
`;

// Variant: European locale, semicolons, "Amount spent (EUR)", "Purchases", "Purchases conversion value", "Ad Name" casing, one ad split over 2 days.
const META_EU = `\uFEFFDay;Campaign name;Ad Set Name;Ad Name;Impressions;Clicks (all);Amount spent (EUR);Purchases;Purchases conversion value;CTR (all)
2026-11-09;Shop;Broad;Linen shirt UGC;"3.200";64;"45,50";3;"180,00";2,00
2026-11-10;Shop;Broad;Linen shirt UGC;"2.800";60;"40,00";2;"120,00";2,14
2026-11-10;Shop;Broad;Studio packshot;"4.100";30;"70,25";1;"35,00";0,73
`;

describe("Meta CSV parser", () => {
  it("maps US headers incl. currency and parentheticals", () => {
    const { columns, currency } = mapColumns(META_US.split("\n")[0]?.split('","').map((h) => h.replace(/"/g, "")) ?? []);
    expect(currency).toBe("USD");
    expect(columns.adName).toBe(2);
    expect(columns.spend).toBe(12);
    expect(columns.costPerResult).toBe(9);
    expect(columns.cpc).toBe(17);
    expect(columns.ctr).toBe(18);
    expect(columns.roas).toBe(19);
  });

  it("parses a US export, skips the total row, sorts by spend", () => {
    const r = parseCsvReport(META_US);
    if (!r.ok) throw new Error(r.reason);
    expect(r.report.ads.map((a) => a.name)).toEqual(["Stop losing Saturday bookings", "Meet the team video", "Spring offer 20% off", "New: gift cards"]);
    const top = r.report.ads[0];
    expect(top).toMatchObject({ spend: 467.4, impressions: 15600, clicks: 312, results: 41, costPerResult: 11.4, days: 14 });
    expect(r.report.ads[3]).toMatchObject({ results: 0, costPerResult: null, days: 3 });
  });

  it("parses a semicolon EU export and aggregates daily rows", () => {
    const r = parseCsvReport(META_EU);
    if (!r.ok) throw new Error(r.reason);
    expect(r.report.currency).toBe("EUR");
    const linen = r.report.ads.find((a) => a.name === "Linen shirt UGC");
    expect(linen).toMatchObject({ impressions: 6000, spend: 85.5, clicks: 124, purchases: 5, results: 5, roas: 3.51, days: 2 });
  });

  it("parses localized numbers", () => {
    expect(parseNumber("$1,234.56")).toBe(1234.56);
    expect(parseNumber("1.234,56 €")).toBe(1234.56);
    expect(parseNumber("2.5%")).toBe(2.5);
    expect(parseNumber("12,000")).toBe(12000);
    expect(parseNumber("0,73")).toBe(0.73);
    expect(parseNumber("—")).toBeNull();
  });

  it("rejects files without an ad column", () => {
    expect(parseCsvReport("foo,bar\n1,2\n")).toEqual({ ok: false, reason: "no_ad_column" });
  });
});

describe("assessment", () => {
  it("picks the cheapest-per-result winner and flags thin data", () => {
    const r = parseCsvReport(META_US);
    if (!r.ok) throw new Error(r.reason);
    const a = assessReport(r.report.ads, r.report.currency);
    expect(a.basis).toBe("cost_per_result");
    expect(a.winner).toBe("Stop losing Saturday bookings");
    expect(a.ads.find((x) => x.name === "Meet the team video")?.verdict).toBe("kill");
    expect(a.ads.find((x) => x.name === "New: gift cards")).toMatchObject({ enoughData: false, verdict: "watch" });
    expect(a.waitDays).toBeGreaterThanOrEqual(1);
  });

  it("says wait when nothing has enough data", () => {
    const r = parseCsvReport(`Ad name,Amount spent (USD),Impressions,Link clicks,Results\nA,5,300,3,0\nB,8,500,6,1\n`);
    if (!r.ok) throw new Error(r.reason);
    const a = assessReport(r.report.ads, "USD");
    expect(a).toMatchObject({ enoughData: false, winner: null, confidence: "low", waitDays: 3 });
    const v = finalizeVerdict({ ...SAMPLE_VERDICT, actions: [] }, a);
    expect(v.winner).toBeNull();
    expect(v.actions[0]?.kind).toBe("wait");
    expect(v.ads.map((x) => x.verdict)).toEqual(["watch", "watch"]);
    expect(CoachVerdictSchema.safeParse(v).success).toBe(true);
  });
});

describe("verdict schema", () => {
  it("accepts the sample and rejects >3 actions or bad verdicts", () => {
    expect(CoachVerdictSchema.safeParse(SAMPLE_VERDICT).success).toBe(true);
    const a = SAMPLE_VERDICT.actions[0];
    expect(CoachVerdictSchema.safeParse({ ...SAMPLE_VERDICT, actions: [a, a, a, a] }).success).toBe(false);
    expect(CoachVerdictSchema.safeParse({ ...SAMPLE_VERDICT, ads: [{ name: "x", verdict: "pause", reason: "", keyNumber: "" }] }).success).toBe(false);
  });
});

describe("access", () => {
  const ws = (adsPlan: string, subscriptionStatus = "active") => ({ adsPlan, subscriptionStatus, suspendedAt: null });
  it("Ad Department is unlimited up to the daily cap", () => {
    expect(coachAccess(ws("ad_department"), { freeUsed: 5, last24h: 9 })).toMatchObject({ mode: "unlimited", canReview: true });
    expect(coachAccess(ws("ad_department", "trialing"), { freeUsed: 0, last24h: 10 })).toMatchObject({ mode: "unlimited", canReview: false, reason: "daily_limit" });
  });
  it("other paid plans get one free review", () => {
    expect(coachAccess(ws("starter"), { freeUsed: 0, last24h: 0 })).toMatchObject({ mode: "one_free", canReview: true });
    expect(coachAccess(ws("growth"), { freeUsed: 1, last24h: 0 })).toMatchObject({ mode: "one_free", canReview: false, reason: "free_used" });
  });
  it("trial and lapsed plans see the sample", () => {
    expect(coachAccess(ws("trial", "none"), { freeUsed: 0, last24h: 0 }).mode).toBe("sample");
    expect(coachAccess(ws("ad_department", "canceled"), { freeUsed: 0, last24h: 0 }).mode).toBe("sample");
  });
});

describe("uploads + matching", () => {
  it("allows screenshots or one table, not both", () => {
    expect(uploadKind([{ mime: "image/png", bytes: 1 }])).toEqual({ ok: true, kind: "screenshots" });
    expect(uploadKind([{ mime: "text/csv", bytes: 1 }])).toEqual({ ok: true, kind: "table" });
    expect(uploadKind([{ mime: "text/csv", bytes: 1 }, { mime: "image/png", bytes: 1 }]).ok).toBe(false);
    expect(uploadKind(Array(6).fill({ mime: "image/png", bytes: 1 })).ok).toBe(false);
    expect(uploadKind([{ mime: "image/png", bytes: 9 * 1024 * 1024 }]).ok).toBe(false);
  });
  it("matches a winner to the user's own ad by headline", () => {
    const own = [
      { id: "a1", headline: "Never lose a Saturday booking again", createdAt: new Date("2026-11-01") },
      { id: "a2", headline: "Gift cards for every occasion", createdAt: new Date("2026-11-02") },
    ];
    expect(matchOwnAd(["Never lose a Saturday booking again!"], own)?.id).toBe("a1");
    expect(matchOwnAd(["Totally different words here"], own)).toBeNull();
  });
});

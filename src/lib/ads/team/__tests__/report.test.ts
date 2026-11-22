import { describe, expect, it } from "vitest";
import { buildTeamReport, LEAD_MISMATCH_REASON, numberTokens, reportWindow, sameNumbers, teamReportParagraphs, teamResultsReport, type ActionRow, type PerfDay } from "../report";
import { evidenceFocus, steeredFocus } from "../../autopilot";

const w = reportWindow("2026-11-23"); // Monday: reports Mon Nov 16 .. Sun Nov 22
const mandate = { state: "live", monthlyLimitMinor: 600_00, currency: "USD" };
const day = (d: string, spendMinor: number, leads: number, metaAdId = "m1", adId: string | null = "a1"): PerfDay => ({ metaAdId, adId, day: d, spendMinor, impressions: 1000, clicks: 10, leads });
const weekDays = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
const prevDays = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];

describe("report window", () => {
  it("is the last complete ISO week, plus month-to-date", () => {
    expect(w).toMatchObject({ week: "2026-W47", weekStart: "2026-11-16", weekEnd: "2026-11-22", prevStart: "2026-11-09", prevEnd: "2026-11-15", monthStart: "2026-11-01", dayOfMonth: 23, daysInMonth: 30 });
  });
});

describe("team report", () => {
  it("numbers and labels: spend week/month vs limit measured, projection estimated, CPL measured", () => {
    const days = [...weekDays.map((d) => day(d, 20_00, 1)), ...prevDays.map((d) => day(d, 10_00, 0))];
    const r = buildTeamReport({ window: w, mandate, days, leadDays: weekDays, actions: [] });
    expect(r.spendWeek).toMatchObject({ value: 140_00, certainty: "measured" });
    expect(r.spendMonth).toMatchObject({ value: 210_00, certainty: "measured" });
    expect(r.projectedMonth).toMatchObject({ value: Math.round((210_00 / 23) * 30), certainty: "estimated" });
    expect(r.leadsReceived).toMatchObject({ value: 7, certainty: "measured" });
    expect(r.costPerLead).toMatchObject({ value: 20_00, certainty: "measured" });
    expect(r.leadMismatch).toBeNull();
    const text = teamReportParagraphs(r).join("\n");
    expect(text).toContain("$140 spent on your ads (measured)");
    expect(text).toContain("$210 of your $600 monthly limit (measured)");
    expect(text).toMatch(/\(estimated\)/);
    expect(text).toContain("7 leads received and emailed to you (measured)");
    expect(text).toContain("Cost per lead: $20 (measured: $140 for 7 leads)");
    expect(text).not.toContain("Meta reports");
  });
  it("no data = unknown, never a guessed zero", () => {
    const r = buildTeamReport({ window: w, mandate: { ...mandate, state: "pending" }, days: [], leadDays: [], actions: [] });
    expect(r.spendWeek.certainty).toBe("unknown");
    expect(r.spendMonth.value).toBeNull();
    expect(r.projectedMonth.certainty).toBe("unknown");
    expect(r.costPerLead).toMatchObject({ value: null, certainty: "unknown" });
    const text = teamReportParagraphs(r).join("\n");
    expect(text).toContain("ad spend unknown");
    expect(text).toContain("Cost per lead: unknown");
  });
  it("says too early below the sample threshold, and compares when both weeks have enough leads", () => {
    const few = buildTeamReport({ window: w, mandate, days: [...weekDays.map((d) => day(d, 20_00, 1)), day("2026-11-10", 50_00, 2)], leadDays: [], actions: [] });
    expect(few.claim).toMatch(/^Too early to tell/);
    const many = buildTeamReport({ window: w, mandate, days: [...weekDays.map((d) => day(d, 20_00, 1)), day("2026-11-10", 150_00, 5)], leadDays: [], actions: [] });
    expect(many.claim).toContain("down 33%");
    expect(many.claim).toContain("(7 leads)");
    expect(many.claim).toContain("(5 leads)");
  });
  it("shows Meta-reported vs received leads separately with one reason line when they differ", () => {
    const r = buildTeamReport({ window: w, mandate, days: weekDays.map((d) => day(d, 20_00, 1)), leadDays: ["2026-11-16", "2026-11-18", "2026-11-23"], actions: [] });
    expect(r.leadsReceived.value).toBe(2); // Nov 23 is outside the week
    expect(r.leadsMeta.value).toBe(7);
    expect(r.leadMismatch).toBe(LEAD_MISMATCH_REASON);
    const text = teamReportParagraphs(r).join("\n");
    expect(text).toContain("2 leads received and emailed to you (measured). Meta reports 7 leads for the same week (measured).");
    expect(text.split(LEAD_MISMATCH_REASON)).toHaveLength(2);
    expect(text).toContain("reported by Meta");
  });
  it("lists only real, done actions of the week, grouped by role; none = says none", () => {
    const actions: ActionRow[] = [
      { role: "analyst", kind: "ad_paused", summary: 'Paused "Storm check": no leads after $60.', outcome: "done", day: "2026-11-18" },
      { role: "analyst", kind: "metrics_read", summary: "Read results 1", outcome: "done", day: "2026-11-18" },
      { role: "analyst", kind: "metrics_read", summary: "Read results 2", outcome: "done", day: "2026-11-19" },
      { role: "creative", kind: "focus_steered", summary: "Steered new ads.", outcome: "done", day: "2026-11-16" },
      { role: "launch", kind: "ads_added", summary: "Failed thing", outcome: "failed", day: "2026-11-17" },
      { role: "leads", kind: "lead_received", summary: "Old lead", outcome: "done", day: "2026-11-10" },
    ];
    const r = buildTeamReport({ window: w, mandate, days: [], leadDays: [], actions });
    expect(r.did.map((g) => g.role)).toEqual(["creative", "analyst"]);
    expect(r.did[1]!.lines).toEqual(["Checked your results on 2 days.", 'Paused "Storm check": no leads after $60.']);
    const text = teamReportParagraphs(r).join("\n");
    expect(text).not.toContain("Failed thing");
    expect(text).not.toContain("Old lead");
    expect(teamReportParagraphs(buildTeamReport({ window: w, mandate, days: [], leadDays: [], actions: [] })).join("\n")).toContain("no team actions were recorded");
  });
  it("what's next and owner needs follow the mandate state", () => {
    const capped = teamReportParagraphs(buildTeamReport({ window: w, mandate: { ...mandate, state: "capped" }, days: [], leadDays: [], actions: [] })).join("\n");
    expect(capped).toContain("resume automatically on December 1");
    expect(capped).not.toContain("Needs you");
    const rec = teamReportParagraphs(buildTeamReport({ window: w, mandate: { ...mandate, state: "needs_reconnect", stateReason: "Reconnect Meta please." }, days: [], leadDays: [], actions: [] })).join("\n");
    expect(rec).toContain("Needs you: Reconnect Meta please.");
  });
  it("projection past the limit says spending stops at the limit", () => {
    const r = buildTeamReport({ window: reportWindow("2026-11-10"), mandate, days: [day("2026-11-09", 400_00, 0)], leadDays: [], actions: [] });
    expect(teamReportParagraphs(r).join(" ")).toContain("spending stops at $600");
  });
  it("dashboard-compatible report from stored rows", () => {
    const r = teamResultsReport({ window: w, currency: "USD", days: [day("2026-11-16", 12_50, 1), day("2026-11-17", 7_50, 0, "m2", "a1"), day("2026-11-01", 99_00, 9)], labels: new Map([["a1", "Roof check"]]) });
    expect(r).toMatchObject({ totals: { spend: 20, impressions: 2000, clicks: 20, results: 1 }, ads: [{ key: "a1", label: "Roof check" }] });
  });
});

describe("number guard", () => {
  it("accepts rewording with the same numbers, rejects changed/added/dropped ones", () => {
    const fixed = ["You spent $1,240.50 (measured) for 7 leads."];
    expect(numberTokens(fixed[0]!)).toEqual(["$1240.50", "7"]);
    expect(sameNumbers(fixed, ["Your ads used $1,240.50 (measured) and brought 7 leads!"])).toBe(true);
    expect(sameNumbers(fixed, ["You spent $1,240 (measured) for 7 leads."])).toBe(false);
    expect(sameNumbers(fixed, ["You spent $1,240.50 for 7 leads, up 10%."])).toBe(false);
    expect(sameNumbers(fixed, ["You spent $1,240.50."])).toBe(false);
  });
});

describe("learning loop focus", () => {
  const row = (metaAdId: string, adId: string | null, spendMinor: number, leads: number) => ({ metaAdId, adId, spendMinor, impressions: 3000, clicks: 30, leads });
  const ads = [{ id: "a1", angle: "Same-day leak repair", hook: "Water on the floor" }, { id: "a2", angle: "Free roof check", hook: "x" }];
  it("steers by the winner (>= 3 leads, lowest CPL, summed per Komendly ad)", () => {
    const e = evidenceFocus([row("m1", "a1", 30_00, 2), row("m1b", "a1", 30_00, 2), row("m2", "a2", 100_00, 4)], ads);
    expect(e).toMatchObject({ adId: "a1", leads: 4, spendMinor: 60_00, cplMinor: 15_00, angle: "Same-day leak repair" });
    expect(e!.focus).toBe("More ads like the one that brings the cheapest leads: Same-day leak repair");
  });
  it("no winner = no steering", () => {
    expect(evidenceFocus([row("m1", "a1", 30_00, 2), row("m2", "a2", 50_00, 1)], ads)).toBeNull();
    expect(evidenceFocus([row("m9", null, 30_00, 9)], ads)).toBeNull();
    expect(steeredFocus(null, null)).toEqual({ focus: null, source: null });
  });
  it("owner focus always wins", () => {
    const e = evidenceFocus([row("m1", "a1", 30_00, 5)], ads);
    expect(steeredFocus("Push the Black Friday sale", e)).toEqual({ focus: "Push the Black Friday sale", source: "owner" });
    expect(steeredFocus("   ", e)).toEqual({ focus: e!.focus, source: "evidence" });
  });
});

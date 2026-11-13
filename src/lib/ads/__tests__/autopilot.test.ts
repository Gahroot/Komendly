import { describe, expect, it } from "vitest";
import { autopilotEligible, autopilotPlanPrompt, autopilotSettings, autopilotVideoPrompt, cleanFocus, dropTimeLabel, nextDropLabel, parseAutopilotPatch, upcomingMoments } from "../autopilot";

describe("autopilot settings", () => {
  it("defaults: on, Monday 9am, with video", () => {
    expect(autopilotSettings(null)).toEqual({ enabled: true, focus: null, dayOfWeek: 1, hour: 9, timezone: null, includeVideo: true });
    expect(autopilotSettings({ dayOfWeek: 9, hour: -1, enabled: false })).toMatchObject({ dayOfWeek: 1, hour: 9, enabled: false });
  });
  it("eligibility = Ad Department or Agency with a live subscription", () => {
    expect(autopilotEligible({ adsPlan: "ad_department", subscriptionStatus: "active" })).toBe(true);
    expect(autopilotEligible({ adsPlan: "agency", subscriptionStatus: "trialing" })).toBe(true);
    expect(autopilotEligible({ adsPlan: "growth", subscriptionStatus: "active" })).toBe(false);
    expect(autopilotEligible({ adsPlan: "scale", subscriptionStatus: "active" })).toBe(false);
    expect(autopilotEligible({ adsPlan: "agency", subscriptionStatus: "canceled" })).toBe(false);
  });
  it("cleans and validates the focus patch", () => {
    expect(cleanFocus("  push   the\nBlack Friday sale ")).toBe("push the Black Friday sale");
    expect(cleanFocus("   ")).toBeNull();
    expect(parseAutopilotPatch({ focus: "  Black Friday " })).toEqual({ ok: true, patch: { focus: "Black Friday" } });
    expect(parseAutopilotPatch({ focus: "" })).toEqual({ ok: true, patch: { focus: null } });
    expect(parseAutopilotPatch({ enabled: false })).toEqual({ ok: true, patch: { enabled: false } });
    expect(parseAutopilotPatch({ enabled: "yes" }).ok).toBe(false);
    expect(parseAutopilotPatch({ focus: "x".repeat(201) }).ok).toBe(false);
    expect(parseAutopilotPatch({}).ok).toBe(false);
    expect(parseAutopilotPatch({ hour: 24 }).ok).toBe(false);
  });
  it("labels the next drop", () => {
    expect(dropTimeLabel(1, 9)).toBe("Monday 9am");
    expect(dropTimeLabel(5, 0)).toBe("Friday 12am");
    expect(dropTimeLabel(7, 15)).toBe("Sunday 3pm");
    expect(nextDropLabel({ settings: autopilotSettings(null), dueNow: false })).toBe("Next drop: Monday 9am");
    expect(nextDropLabel({ settings: autopilotSettings({ enabled: false }), dueNow: false })).toBe("Autopilot is off");
  });
});

describe("retail calendar", () => {
  it("finds Thanksgiving week moments in the next 14 days (2026)", () => {
    const m = upcomingMoments(new Date("2026-11-16T15:00:00Z"));
    expect(m.map((x) => [x.key, x.date, x.daysAway])).toEqual([
      ["thanksgiving", "2026-11-26", 10],
      ["black_friday", "2026-11-27", 11],
      ["small_business_saturday", "2026-11-28", 12],
      ["cyber_monday", "2026-11-30", 14],
    ]);
  });
  it("crosses the year end and computes floating dates", () => {
    expect(upcomingMoments(new Date("2026-12-24T15:00:00Z")).map((x) => x.key)).toEqual(["christmas", "new_years_eve", "new_year"]);
    expect(upcomingMoments(new Date("2027-05-01T15:00:00Z")).find((x) => x.key === "mothers_day")?.date).toBe("2027-05-09");
    expect(upcomingMoments(new Date("2027-03-20T15:00:00Z")).find((x) => x.key === "easter")?.date).toBe("2027-03-28");
    expect(upcomingMoments(new Date("2027-07-20T15:00:00Z")).map((x) => x.key)).toContain("back_to_school");
    expect(upcomingMoments(new Date("2027-02-01T15:00:00Z"), null, 14)).toEqual([{ key: "valentines", name: "Valentine's Day", date: "2027-02-14", daysAway: 13, hint: expect.any(String) }]);
    expect(upcomingMoments(new Date("2027-06-01T15:00:00Z"), null, 3)).toEqual([]);
  });
  it("builds planner and video prompts from focus + dates without inventing offers", () => {
    const moments = upcomingMoments(new Date("2026-11-16T15:00:00Z"));
    const p = autopilotPlanPrompt({ focus: "push the Black Friday sale", moments });
    expect(p).toContain("THIS WEEK'S FOCUS");
    expect(p).toContain("Black Friday in 11 days");
    expect(p).toContain("Never invent discounts");
    expect(autopilotPlanPrompt({ focus: null, moments: [] })).toBe("");
    const v = autopilotVideoPrompt({ focus: null, brandName: "Brew", moments, uploads: 2 });
    expect(v).toContain("15-second 9:16");
    expect(v).toContain("Thanksgiving in 10 days");
    expect(v).toContain("latest uploads");
    expect(v).toContain("Don't ask me questions");
  });
});

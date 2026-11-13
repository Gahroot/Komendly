import { describe, expect, it } from "vitest";
import { isAdDepartment, isoWeekKey, weeklyAvoidList, weeklyAwarenessMix, weeklyDropDecision, weeklyDropEmailCopy, weeklyDropTitle } from "../weekly-drop";

// 2026-11-16 is a Monday. 13:00Z = 08:00 New York (EST), 15:00Z = 10:00.
const MON_8 = new Date("2026-11-16T13:00:00Z");
const MON_10 = new Date("2026-11-16T15:00:00Z");
const base = { enabled: true, subscribed: true, tz: null };

describe("weekly drop schedule", () => {
  it("keys ISO weeks in the local zone", () => {
    expect(isoWeekKey(MON_10)).toBe("2026-W47");
    expect(isoWeekKey(new Date("2026-11-16T03:00:00Z"))).toBe("2026-W46"); // still Sunday night in New York
    expect(isoWeekKey(new Date("2027-01-01T17:00:00Z"))).toBe("2026-W53");
  });
  it("first drop right away, then Monday 9am, once per week", () => {
    expect(weeklyDropDecision({ ...base, now: MON_8, weeksDone: [] })).toMatchObject({ due: true, reason: "first_drop" });
    expect(weeklyDropDecision({ ...base, now: MON_8, weeksDone: ["2026-W46"] })).toMatchObject({ due: false, reason: "before_monday_9am" });
    expect(weeklyDropDecision({ ...base, now: MON_10, weeksDone: ["2026-W46"] })).toMatchObject({ due: true, week: "2026-W47", reason: "monday" });
    expect(weeklyDropDecision({ ...base, now: MON_10, weeksDone: ["2026-W46", "2026-W47"] })).toMatchObject({ due: false, reason: "already_this_week" });
  });
  it("kill switch and plan gate", () => {
    expect(weeklyDropDecision({ ...base, enabled: false, now: MON_10, weeksDone: [] }).due).toBe(false);
    expect(weeklyDropDecision({ ...base, subscribed: false, now: MON_10, weeksDone: [] }).due).toBe(false);
    expect(isAdDepartment({ adsPlan: "ad_department", subscriptionStatus: "trialing" })).toBe(true);
    expect(isAdDepartment({ adsPlan: "ad_department", subscriptionStatus: "canceled" })).toBe(false);
    expect(isAdDepartment({ adsPlan: "ad_department", subscriptionStatus: "active", suspendedAt: new Date() })).toBe(false);
    expect(isAdDepartment({ adsPlan: "growth", subscriptionStatus: "active" })).toBe(false);
  });
});

describe("weekly drop content", () => {
  it("dedupes earlier angles/headlines, newest first", () => {
    expect(weeklyAvoidList([{ angle: "Morning rush", headline: "Coffee in 2 min" }, { angle: "morning  rush", headline: "coffee in 2 min" }, { angle: null, headline: "Gift it" }, { headline: "" }])).toEqual(["Morning rush | Coffee in 2 min", "Gift it"]);
    expect(weeklyAvoidList(Array.from({ length: 50 }, (_, i) => ({ headline: `h${i}` })), 3)).toEqual(["h0", "h1", "h2"]);
  });
  it("rotates awareness mixes of 5", () => {
    for (let i = 0; i < 4; i++) expect(Object.values(weeklyAwarenessMix(i)).reduce((a, b) => a + (b ?? 0), 0)).toBe(5);
    expect(weeklyAwarenessMix(0)).not.toEqual(weeklyAwarenessMix(1));
  });
  it("titles and copy", () => {
    expect(weeklyDropTitle(new Date("2026-11-17T15:00:00Z"))).toBe("Weekly Drop · Nov 17");
    const c = weeklyDropEmailCopy({ firstName: "Ana", brandName: "Brew", ready: 6 });
    expect(c.subject).toBe("Your new ads are ready");
    expect(c.paragraphs.join(" ")).not.toContain("video");
    expect(c.paragraphs.join(" ")).not.toContain("focus:");
    const v = weeklyDropEmailCopy({ firstName: "Ana", brandName: "Brew", ready: 6, focus: "push the Black Friday sale", videoReady: true });
    expect(v.subject).toBe("Your new ads and video are ready");
    expect(v.paragraphs).toContain("This week's focus: push the Black Friday sale");
    expect(v.paragraphs.join(" ")).toContain("Monday video");
  });
});

describe("autopilot schedule", () => {
  it("honours a custom day/hour and catches up later in the week", () => {
    const wed = { ...base, weeksDone: ["2026-W46"], dayOfWeek: 3, hour: 14 };
    expect(weeklyDropDecision({ ...wed, now: MON_10 })).toMatchObject({ due: false, reason: "before_drop_time" });
    expect(weeklyDropDecision({ ...wed, now: new Date("2026-11-18T18:00:00Z") })).toMatchObject({ due: false, reason: "before_drop_time" }); // Wed 13:00 NY
    expect(weeklyDropDecision({ ...wed, now: new Date("2026-11-18T19:00:00Z") })).toMatchObject({ due: true }); // Wed 14:00 NY
    expect(weeklyDropDecision({ ...wed, now: new Date("2026-11-20T19:00:00Z") })).toMatchObject({ due: true }); // Friday catch-up
  });
});

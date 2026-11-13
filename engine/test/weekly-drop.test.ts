import { describe, expect, it } from "vitest";
import { weeklyAvoidList, weeklyDropDecision } from "../../src/lib/ads/weekly-drop";
import { WEEKLY_COST_CAP_MICROS, weeklyFirstTryMicros, weeklyOverBudget } from "../src/jobs/gift-policy";

describe("weekly drop (engine)", () => {
  it("idempotent per ISO week: a second tick in the same week is not due", () => {
    const now = new Date("2026-11-18T15:00:00Z");
    const first = weeklyDropDecision({ now, enabled: true, subscribed: true, weeksDone: ["2026-W46"] });
    expect(first.due).toBe(true);
    expect(weeklyDropDecision({ now: new Date(now.getTime() + 600_000), enabled: true, subscribed: true, weeksDone: ["2026-W46", first.week] }).due).toBe(false);
  });
  it("angle de-dup input", () => {
    expect(weeklyAvoidList([{ angle: "A", headline: "H" }, { angle: "a", headline: "h" }])).toEqual(["A | H"]);
  });
  it("cost guard", () => {
    expect(weeklyFirstTryMicros()).toBeLessThanOrEqual(WEEKLY_COST_CAP_MICROS);
    expect(weeklyOverBudget(WEEKLY_COST_CAP_MICROS - 100_000)).toBe(true);
    expect(weeklyOverBudget(0)).toBe(false);
  });
});

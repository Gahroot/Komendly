import { describe, expect, it } from "vitest";
import { dryRunCycleDoneThisWeek } from "../src/exec/strategy";

describe("exec strategy dry run runs once per ISO week", () => {
  const now = new Date("2026-11-27T14:30:00Z"); // 2026-W48
  it("skips when the last ok cycle was this week", () => {
    expect(dryRunCycleDoneThisWeek({ lastOkAt: "2026-11-27T03:00:44Z" }, now)).toBe(true);
    expect(dryRunCycleDoneThisWeek({ lastOkAt: "2026-11-23T00:10:00Z" }, now)).toBe(true); // Monday of the same week
  });
  it("runs when there was no ok cycle or it was in an earlier week", () => {
    expect(dryRunCycleDoneThisWeek({ lastOkAt: null }, now)).toBe(false);
    expect(dryRunCycleDoneThisWeek({ lastOkAt: "2026-11-22T23:59:00Z" }, now)).toBe(false); // Sunday of W47
  });
});

import { describe, expect, it } from "vitest";
import { earlyStarters, EARLY_MIN_DAYS } from "../src/warmup";
import { warmupReadiness } from "../../src/lib/ads/outbound/policy";

describe("early starters", () => {
  it("picks the first four mailboxes of each domain by address", () => {
    const boxes = ["e@a.com", "c@a.com", "a@a.com", "d@a.com", "b@a.com", "z@b.com", "y@b.com"].map((address) => ({ id: address, address, domain: address.split("@")[1] ?? "" }));
    expect([...earlyStarters(boxes)].sort()).toEqual(["a@a.com", "b@a.com", "c@a.com", "d@a.com", "y@b.com", "z@b.com"]);
  });
  it("an early starter is ready on Nov 20 with clean placements, not on Nov 19", () => {
    const since = new Date("2026-11-12T21:00:00Z");
    const g = { since, spamRate: 0.02, coldStartedAt: null, minDays: EARLY_MIN_DAYS, maxSpamRate: 0.1 };
    expect(warmupReadiness(g, new Date("2026-11-19T18:00:00Z")).ready).toBe(false);
    expect(warmupReadiness(g, new Date("2026-11-20T15:00:00Z")).ready).toBe(true);
    expect(warmupReadiness({ ...g, spamRate: 0.2 }, new Date("2026-11-20T15:00:00Z")).ready).toBe(false);
  });
});

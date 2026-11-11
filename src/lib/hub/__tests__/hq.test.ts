import { describe, expect, it } from "vitest";
import { attentionList, creditsSpentByApp, legacyMrr, windowCounts } from "../hq";

describe("ozzy hq maths", () => {
  it("legacy MRR counts active testimonial plans only", () => {
    const r = legacyMrr([
      { plan: "starter", subscriptionStatus: "active" },
      { plan: "pro", subscriptionStatus: "canceled" },
      { plan: "pending", subscriptionStatus: "active" },
    ]);
    expect(r.subscribers).toBe(1);
    expect(r.mrrCents).toBeGreaterThan(0);
  });
  it("buckets dates into today / 7d / 30d", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const r = windowCounts([new Date("2026-11-10T01:00:00Z"), new Date("2026-11-05T00:00:00Z"), new Date("2026-10-20T00:00:00Z"), new Date("2026-09-01T00:00:00Z")], now);
    expect(r).toEqual({ today: 1, d7: 2, d30: 3 });
  });
  it("credits spent by app nets releases", () => {
    expect(creditsSpentByApp([{ reason: "reserve", delta: -30 }, { reason: "release", delta: 5 }, { reason: "studio_charge", delta: -8 }, { reason: "topup", delta: 10 }])).toEqual({ ads: 25, studio: 8 });
  });
  it("attention list drops zeros and sorts bad first", () => {
    const out = attentionList([
      { key: "a", label: "a", count: 3, href: "/", tone: "warn" },
      { key: "b", label: "b", count: 1, href: "/", tone: "bad" },
      { key: "c", label: "c", count: 0, href: "/", tone: "bad" },
    ]);
    expect(out.map((i) => i.key)).toEqual(["b", "a"]);
  });
});

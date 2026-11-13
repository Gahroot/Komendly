import { describe, expect, it } from "vitest";
import { ago, budgetUse, dailySeries, freshness, funnelSteps, groupArms, money, ozzyLine, pct, usd, type ArmRow } from "../aggregate";
import { KlySettingsSchema, KLY_SETTINGS_DEFAULTS } from "../settings";

const arm = (o: Partial<ArmRow>): ArmRow => ({ id: "a", dimension: "subject", key: "k", status: "active", origin: "seed", rationale: null, assigned: 0, sends: 0, clicks: 0, replies: 0, positiveReplies: 0, signups: 0, paid: 0, revenueCents: 0, ...o });

describe("funnelSteps", () => {
  it("computes step and top rates, null on zero denominators", () => {
    const s = funnelSteps({ found: 100, qualified: 50, giftMade: 40, sent: 0, clicked: 0, replied: 0, signedUp: 0, paid: 0 });
    expect(s[0]).toMatchObject({ key: "found", fromPrev: null, fromTop: null });
    expect(s[1]).toMatchObject({ fromPrev: 0.5, fromTop: 0.5 });
    expect(s[4]).toMatchObject({ key: "clicked", fromPrev: null, fromTop: 0 });
    expect(funnelSteps({ found: 0, qualified: 0, giftMade: 0, sent: 0, clicked: 0, replied: 0, signedUp: 0, paid: 0 })[1]?.fromTop).toBeNull();
  });
});

describe("money", () => {
  it("converts micros, cost per paying customer and ROI", () => {
    const m = money({ revenueMonthCents: 5000, revenueAllCents: 20000, payingCustomers: 2, signups: 5, costAllMicros: BigInt(50_000_000), costMonthMicros: BigInt(10_000_000) });
    expect(m.costAllCents).toBe(5000);
    expect(m.costMonthCents).toBe(1000);
    expect(m.costPerPayingCents).toBe(2500);
    expect(m.roi).toBe(3);
  });
  it("is honest with no spend or customers", () => {
    const m = money({ revenueMonthCents: 0, revenueAllCents: 0, payingCustomers: 0, signups: 0, costAllMicros: BigInt(0), costMonthMicros: BigInt(0) });
    expect(m.roi).toBeNull();
    expect(m.costPerPayingCents).toBeNull();
  });
});

describe("groupArms", () => {
  it("groups by dimension, champion first, retired apart", () => {
    const g = groupArms([
      arm({ id: "1", key: "b", sends: 10, replies: 1 }),
      arm({ id: "2", key: "a", sends: 10, replies: 3 }),
      arm({ id: "3", key: "c", status: "champion", sends: 10, replies: 0 }),
      arm({ id: "4", key: "old", status: "retired" }),
      arm({ id: "5", dimension: "angle", key: "x" }),
    ]);
    expect(g.map((x) => x.dimension)).toEqual(["angle", "subject"]);
    expect(g[1]?.live.map((a) => a.id)).toEqual(["3", "2", "1"]);
    expect(g[1]?.retired.map((a) => a.id)).toEqual(["4"]);
    expect(g[1]?.live[1]?.replyRate).toBeCloseTo(0.3);
  });
});

describe("health helpers", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  it("freshness", () => {
    expect(freshness(null, now)).toBe("never");
    expect(freshness(new Date(now.getTime() - 60_000), now)).toBe("live");
    expect(freshness(new Date(now.getTime() - 10 * 60_000), now)).toBe("stale");
    expect(freshness(new Date(now.getTime() - 60 * 60_000), now)).toBe("down");
  });
  it("budgetUse", () => {
    expect(budgetUse(150, 300)).toEqual({ pct: 0.5, over: false });
    expect(budgetUse(300, 300).over).toBe(true);
    expect(budgetUse(0, 0)).toEqual({ pct: null, over: false });
  });
  it("dailySeries zero-fills 30 days ending today", () => {
    const s = dailySeries([{ day: new Date("2026-11-10T00:00:00Z"), sent: 4, clicks: 1, replies: 0, signups: 1, paid: 0 }], now);
    expect(s).toHaveLength(30);
    expect(s[29]?.date).toBe("2026-11-11");
    expect(s[28]).toMatchObject({ date: "2026-11-10", sent: 4, signups: 1 });
    expect(s[0]?.sent).toBe(0);
  });
  it("formatters", () => {
    expect(usd(123456)).toBe("$1,234.56");
    expect(usd(5000)).toBe("$50");
    expect(pct(null)).toBe("—");
    expect(pct(0.123)).toBe("12.3%");
    expect(ago(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 min ago");
  });
});

describe("ozzyLine", () => {
  const base = { weekSignups: 0, weekPaid: 0, weekRevenueCents: 0, sentToday: 0, mailboxes: 1, heartbeat: "live" as const, enabled: true };
  it("speaks only real numbers", () => {
    expect(ozzyLine({ ...base, weekSignups: 3 })).toBe("G'day! 3 new signups from Kly this week.");
    expect(ozzyLine({ ...base, weekPaid: 1, weekRevenueCents: 4900 })).toContain("1 new paying customer this week, $49");
    expect(ozzyLine({ ...base, mailboxes: 0 })).toContain("Waiting for mailboxes");
    expect(ozzyLine({ ...base, heartbeat: "never" })).toContain("hasn't checked in");
    expect(ozzyLine({ ...base, enabled: false })).toContain("switched off");
  });
});

describe("KlySettingsSchema", () => {
  it("accepts the defaults and rejects out-of-bounds values", () => {
    expect(KlySettingsSchema.safeParse(KLY_SETTINGS_DEFAULTS).success).toBe(true);
    expect(KlySettingsSchema.safeParse({ ...KLY_SETTINGS_DEFAULTS, minQualityScore: 11 }).success).toBe(false);
    expect(KlySettingsSchema.safeParse({ ...KLY_SETTINGS_DEFAULTS, dailySendCeiling: -1 }).success).toBe(false);
    expect(KlySettingsSchema.safeParse({ ...KLY_SETTINGS_DEFAULTS, targetCountries: ["usa"] }).success).toBe(false);
  });
});

import { encoreState } from "../encore";
describe("encoreState", () => {
  it("maps the encore run to none/drawing/done/failed", () => {
    expect(encoreState(null, null)).toBe("none");
    expect(encoreState(null, "r")).toBe("drawing");
    expect(encoreState({ status: "rendering" }, "r")).toBe("drawing");
    expect(encoreState({ status: "partial" }, "r")).toBe("done");
    expect(encoreState({ status: "failed" }, "r")).toBe("failed");
  });
});

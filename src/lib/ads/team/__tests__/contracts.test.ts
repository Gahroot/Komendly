import { describe, expect, it } from "vitest";
import {
  authorizationText, budgetGuard, campaignSpendCap, dailyBudgetMinor, decideOptimizations, improvementClaim, monthKey,
  parseMandateInput, specialAdCategory, splitDailyBudget, stopVerdict, winner, type AdStats,
} from "../contracts";

const now = new Date("2026-11-22T12:00:00Z");
const old = new Date("2026-11-10T12:00:00Z");
const ad = (id: string, spendMinor: number, leads: number, over: Partial<AdStats> = {}): AdStats =>
  ({ metaAdId: id, adId: null, label: id, launchedAt: old, active: true, spendMinor, impressions: 5000, clicks: 50, leads, ...over });

describe("mandate input", () => {
  it("accepts a valid submission and converts dollars", () => {
    const r = parseMandateInput({ monthlyLimit: "$600", zips: "94110, 94114", leadEmail: "Me@Biz.com", agreed: true });
    expect(r).toEqual({ ok: true, value: { monthlyLimitMinor: 60000, zips: ["94110", "94114"], leadEmail: "me@biz.com", privacyUrl: null, agreed: true } });
  });
  it("requires the authorization tick, minimum budget and real ZIPs", () => {
    expect(parseMandateInput({ monthlyLimit: 600, zips: "94110", leadEmail: "a@b.co" }).ok).toBe(false);
    expect(parseMandateInput({ monthlyLimit: 100, zips: "94110", leadEmail: "a@b.co", agreed: true }).ok).toBe(false);
    expect(parseMandateInput({ monthlyLimit: 600, zips: "941", leadEmail: "a@b.co", agreed: true }).ok).toBe(false);
  });
  it("authorization text states the limit, separate billing and no raise", () => {
    const t = authorizationText({ monthlyLimitMinor: 60000, currency: "USD", adAccountName: "Acme Ads", businessName: "Acme Plumbing" });
    expect(t).toContain("$600");
    expect(t).toMatch(/separately from my Komendly subscription/);
    expect(t).toMatch(/never raise this limit/);
  });
});

describe("budget", () => {
  it("paces daily budget under the monthly limit", () => {
    expect(dailyBudgetMinor(60000)).toBe(1875);
    expect(dailyBudgetMinor(60000) * 31).toBeLessThan(60000);
    expect(splitDailyBudget(1875, 2)).toEqual([937, 937]);
  });
  it("spend cap = spend before month + limit", () => {
    expect(campaignSpendCap(41234, 60000)).toBe(101234);
  });
  it("guard caps at 98%", () => {
    expect(budgetGuard({ monthToDateMinor: 58000, monthlyLimitMinor: 60000 }).action).toBe("run");
    expect(budgetGuard({ monthToDateMinor: 58800, monthlyLimitMinor: 60000 }).action).toBe("cap");
  });
  it("month key uses the account zone", () => {
    expect(monthKey(new Date("2026-12-01T03:00:00Z"), "America/New_York")).toBe("2026-11");
  });
});

describe("stop conditions", () => {
  const base = { killSwitch: false, mandateStatus: "active" as const, subscriptionLive: true, suspended: false, metaConnected: true };
  it("runs only when everything is fine", () => {
    expect(stopVerdict(base).stop).toBe(false);
    expect(stopVerdict({ ...base, killSwitch: true }).stop).toBe(true);
    expect(stopVerdict({ ...base, subscriptionLive: false })).toMatchObject({ stop: true, state: "stopped" });
    expect(stopVerdict({ ...base, metaConnected: false })).toMatchObject({ stop: true, state: "needs_reconnect" });
    expect(stopVerdict({ ...base, mandateStatus: "paused" })).toMatchObject({ stop: true, state: "paused" });
  });
});

describe("special ad categories", () => {
  it("flags housing/credit/employment, not trades", () => {
    expect(specialAdCategory("Bay Area real estate agent")).toBe("housing");
    expect(specialAdCategory("Auto loans and financing")).toBe("credit or financial services");
    expect(specialAdCategory("Emergency plumbing and drain cleaning")).toBeNull();
  });
});

describe("analyst", () => {
  const o = { now, dailyBudgetMinor: 2000, freshAvailable: 5 };
  it("pauses an expensive ad with evidence and keeps at least 2 running", () => {
    const d = decideOptimizations([ad("a", 10000, 10), ad("b", 12000, 10), ad("c", 30000, 5)], o);
    const p = d.filter((x) => x.kind === "pause");
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ metaAdId: "c" });
    expect(d.find((x) => x.kind === "add")).toMatchObject({ count: 2 });
  });
  it("pauses a no-lead spender only past 3x median CPL", () => {
    expect(decideOptimizations([ad("a", 5000, 5), ad("b", 5000, 5), ad("z", 2900, 0)], o).some((x) => x.kind === "pause")).toBe(false);
    expect(decideOptimizations([ad("a", 5000, 5), ad("b", 5000, 5), ad("z", 3100, 0)], o).some((x) => x.kind === "pause")).toBe(true);
  });
  it("never acts on young or low-impression ads", () => {
    const young = ad("y", 99999, 0, { launchedAt: new Date("2026-11-21T12:00:00Z") });
    const thin = ad("t", 99999, 0, { impressions: 500 });
    expect(decideOptimizations([ad("a", 5000, 5), ad("b", 5000, 5), young, thin], o).some((x) => x.kind === "pause")).toBe(false);
  });
  it("never goes below 2 running", () => {
    const d = decideOptimizations([ad("a", 9000, 0), ad("b", 9000, 0)], { ...o, freshAvailable: 0 });
    expect(d.some((x) => x.kind === "pause")).toBe(false);
  });
  it("winner needs >= 3 leads", () => {
    expect(winner([ad("a", 1000, 2)])).toBeNull();
    expect(winner([ad("a", 3000, 3), ad("b", 9000, 3)])?.metaAdId).toBe("a");
  });
  it("improvement claims need samples", () => {
    expect(improvementClaim({ spendMinor: 1000, leads: 2 }, { spendMinor: 1000, leads: 9 })).toMatch(/Too early/);
    expect(improvementClaim({ spendMinor: 50000, leads: 10 }, { spendMinor: 40000, leads: 10 })).toMatch(/down 20%/);
  });
});

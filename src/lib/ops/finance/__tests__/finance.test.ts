import { describe, expect, it } from "vitest";
import { buildPnl, periodBounds, unnecessaryCandidates, type PnlInput } from "../pnl";
import { detectSpike, mad, median } from "../stats";
import { checkSpend } from "../authority";
import { parseFixedItems, summarizeFixed } from "../fixed-costs";
import { parseInsightsSpend, fetchMetaDaySpendCents } from "../meta-spend";

const fixed = summarizeFixed(parseFixedItems({ items: [{ id: "a", name: "A", category: "tools", monthlyCents: 3000 }, { id: "b", name: "B", category: "email", monthlyCents: null }] }), {});
const base = (o: Partial<PnlInput> = {}): PnlInput => ({
  label: "t", from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z"),
  grossRevenueCents: 10000, paymentCount: 40, refundCents: 1000, refundCount: 1, chargebackCents: 0, chargebackCount: 0,
  aiCents: 500, mediaCents: 500, emailCents: 0, klyCents: 500, metaSpendCents: 2000, fixed, cashCents: null,
  channels: [{ channel: "meta_paid", revenueCents: 6000, acquisitionCents: 2000, signups: 10, payments: 3 }, { channel: "direct", revenueCents: 4000, acquisitionCents: 0, signups: 5, payments: 2 }],
  newCustomers: 5, ...o,
});

describe("buildPnl", () => {
  it("computes net revenue, gross margin, operating profit", () => {
    const p = buildPnl(base());
    expect(p.revenue.netCents).toBe(9000);
    expect(p.costOfRevenue.totalCents).toBe(1000);
    expect(p.grossProfitCents).toBe(8000);
    expect(p.grossMarginPct).toBe(88.9);
    expect(p.acquisition.totalCents).toBe(2500);
    expect(p.fixedCents).toBe(3000); // 30 days
    expect(p.operatingProfitCents).toBe(2500);
    expect(p.burnCents).toBe(0);
    expect(p.refundRatePct).toBe(10);
    expect(p.cacCents).toBe(500);
    expect(p.paybackRatio30).toBe(3.2);
  });
  it("allocates COGS by channel revenue and subtracts acquisition", () => {
    const m = buildPnl(base()).channels.find((c) => c.channel === "meta_paid")!;
    expect(m.allocatedCogsCents).toBe(600);
    expect(m.contributionCents).toBe(6000 - 600 - 2000);
  });
  it("lists unknowns instead of inventing costs and lowers confidence", () => {
    const p = buildPnl(base({ aiCents: null, metaSpendCents: null, emailCents: null, chargebackCents: null, chargebackCount: null }));
    expect(p.needsInput.join(" ")).toMatch(/AI inference/);
    expect(p.needsInput.join(" ")).toMatch(/Meta ad spend/);
    expect(p.needsInput.join(" ")).toMatch(/Fixed cost unknown: B/);
    expect(p.chargebackRatePct).toBeNull();
    expect(p.confidence).toBe("estimated");
  });
  it("burn and runway when losing money", () => {
    const p = buildPnl(base({ grossRevenueCents: 0, refundCents: 0, paymentCount: 0, channels: [], newCustomers: 0, cashCents: 30000 }));
    expect(p.operatingProfitCents).toBeLessThan(0);
    expect(p.burnCents).toBe(-p.operatingProfitCents);
    expect(p.runwayMonths).toBeGreaterThan(0);
    expect(p.confidence).toBe("insufficient");
    expect(p.grossMarginPct).toBeNull();
  });
  it("prorates fixed cost for a week", () => {
    const p = buildPnl(base({ from: new Date("2026-11-02T00:00:00Z"), to: new Date("2026-11-09T00:00:00Z") }));
    expect(p.days).toBe(7);
    expect(p.fixedCents).toBe(700);
  });
  it("INFRA_MONTHLY_CENTS replaces infra items", () => {
    const items = parseFixedItems({ items: [{ id: "v", name: "V", category: "infra", monthlyCents: null }, { id: "t", name: "T", category: "tools", monthlyCents: 100 }] });
    const s = summarizeFixed(items, { INFRA_MONTHLY_CENTS: "5000" });
    expect(s.monthlyCents).toBe(5100);
    expect(s.unknown).toHaveLength(0);
  });
});

describe("periodBounds", () => {
  it("last full month and last full Mon-Sun week", () => {
    const now = new Date("2026-11-26T10:00:00Z"); // Thursday
    expect(periodBounds("month", now).label).toBe("2026-10");
    const w = periodBounds("week", now);
    expect(w.from.toISOString().slice(0, 10)).toBe("2026-11-16");
    expect(w.to.toISOString().slice(0, 10)).toBe("2026-11-23");
  });
});

describe("anomaly detection", () => {
  it("median/mad", () => { expect(median([1, 3, 2])).toBe(2); expect(mad([1, 2, 3, 4, 100])).toBe(1); });
  it("flags a real spike, ignores noise and short history", () => {
    const h = [100, 110, 95, 105, 100, 98, 102];
    expect(detectSpike(h, 900).spike).toBe(true);
    expect(detectSpike(h, 120).spike).toBe(false);
    expect(detectSpike([100, 100, 100], 5000).spike).toBe(false);
  });
  it("one outlier in history does not hide a spike (robust)", () => {
    expect(detectSpike([100, 100, 100, 5000, 100, 100], 1500).spike).toBe(true);
  });
  it("flat zero history: tiny cost is not a spike, $20 is", () => {
    expect(detectSpike([0, 0, 0, 0, 0, 0], 100).spike).toBe(false);
    expect(detectSpike([0, 0, 0, 0, 0, 0], 2000).spike).toBe(true);
  });
});

describe("checkSpend", () => {
  it("allows AI under the daily cap, denies above", () => {
    expect(checkSpend({ kind: "ai_inference", amountCents: 100, spentTodayCents: 0 }).allowed).toBe(true);
    expect(checkSpend({ kind: "ai_inference", amountCents: 600, spentTodayCents: 600 }).allowed).toBe(false);
  });
  it("denies new paid services and Meta increases, and unknown kinds", () => {
    expect(checkSpend({ kind: "new_paid_service", amountCents: 1 })).toMatchObject({ allowed: false, needsOwner: true });
    expect(checkSpend({ kind: "meta_spend_increase", amountCents: 1 }).allowed).toBe(false);
    expect(checkSpend({ kind: "other", amountCents: 1 }).allowed).toBe(false);
    expect(checkSpend({ kind: "ai_inference", amountCents: -1 }).allowed).toBe(false);
  });
});

describe("unnecessaryCandidates", () => {
  it("lists zero-output and flagged items only", () => {
    const it = (id: string, extra = {}) => ({ id, name: id, category: "x", monthlyCents: 100, ...extra });
    const r = unnecessaryCandidates([{ item: it("a"), outcomes: 0 }, { item: it("b"), outcomes: 9 }, { item: it("c", { cancelIfUnused: true }), outcomes: null }, { item: it("d", { monthlyCents: 0 }), outcomes: 0 }]);
    expect(r.map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("meta spend", () => {
  it("parses Insights spend to cents", () => expect(parseInsightsSpend({ data: [{ spend: "15.20" }] })).toBe(1520));
  it("returns null without a token and on errors", async () => {
    expect(await fetchMetaDaySpendCents("2026-11-25", {})).toBeNull();
    expect(await fetchMetaDaySpendCents("2026-11-25", { META_ADS_TOKEN: "x" }, async () => { throw new Error("net"); })).toBeNull();
    expect(await fetchMetaDaySpendCents("2026-11-25", { META_ADS_TOKEN: "x" }, async () => ({ ok: true, status: 200, json: async () => ({ data: [{ spend: "2.5" }] }) }))).toBe(250);
  });
});

import { csvCell, toCsv, recordsMarkdown } from "../records";
describe("records", () => {
  it("escapes csv and guards formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(-5)).toBe("-5");
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\n1,\n");
  });
  it("markdown shows unknowns", () => expect(recordsMarkdown({ month: "2026-10", grossCents: 100, refundsCents: 0, netCents: 100, costOfRevenueCents: 0, metaSpendCents: null, fixedCents: 0, partnerPayoutsCents: 0, unknown: ["x"] })).toMatch(/Meta ad spend \| unknown/));
});

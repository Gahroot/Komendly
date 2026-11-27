/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { assignVariant, concludeExperiment, defineExperiment, evaluateExperiment, loadExperimentResults, recordConversion, recordExposure, type ExperimentDef } from "../experiments";
import { channelOfTouch, computeEconomics, isInternalAccount, rate, type EconomicsInput } from "../economics";
import { businessStage, diagnoseConstraint } from "../constraints";

const def: ExperimentDef = { key: "t1", surface: "s", hypothesis: "h", metric: "purchased", variants: [{ id: "a", weight: 1 }, { id: "b", weight: 1, payload: { x: 1 } }], minPerVariant: 50 };
function memDb() {
  const rows: { name: string; props: Record<string, unknown>; createdAt: Date }[] = [];
  const match = (r: (typeof rows)[number], w: any): boolean => (!w.name || r.name === w.name) && (!w.props || r.props[w.props.path[0]] === w.props.equals) && (!w.AND || w.AND.every((a: any) => match(r, a)));
  return { rows, adsEvent: { create: async (a: any) => void rows.push({ ...a.data, createdAt: new Date() }), findFirst: async (a: any) => rows.find((r) => match(r, a.where)) ?? null, findMany: async (a: any) => rows.filter((r) => match(r, a.where)) } };
}
describe("experiments", () => {
  it("assigns deterministically and null when unknown", () => {
    expect(assignVariant("t1", "u1", [def])).toEqual(assignVariant("t1", "u1", [def]));
    expect(assignVariant("nope", "u1", [def])).toBeNull();
    const n = Array.from({ length: 400 }, (_, i) => assignVariant("t1", `u${i}`, [def])!.variantId).filter((v) => v === "a").length;
    expect(n).toBeGreaterThan(150); expect(n).toBeLessThan(250);
  });
  it("exposure and conversion are idempotent; conversion needs exposure", async () => {
    const db = memDb();
    expect(await recordConversion(db, "t1", "u1")).toBe(false);
    expect(await recordExposure(db, "t1", "a", "u1")).toBe(true);
    expect(await recordExposure(db, "t1", "b", "u1")).toBe(false);
    expect(await recordConversion(db, "t1", "u1")).toBe(true);
    expect(await recordConversion(db, "t1", "u1")).toBe(false);
    await defineExperiment(db, def);
    const r = await loadExperimentResults(db, "t1");
    expect(r.counts.find((c) => c.variantId === "a")).toEqual({ variantId: "a", exposures: 1, conversions: 1 });
    expect(r.evaluation.verdict).toBe("insufficient");
    await concludeExperiment(db, "t1", "a", "test");
    expect((await loadExperimentResults(db, "t1")).concluded?.winner).toBe("a");
  });
  it("never calls a winner on tiny samples; does on clear big ones", () => {
    expect(evaluateExperiment([{ variantId: "a", exposures: 10, conversions: 0 }, { variantId: "b", exposures: 10, conversions: 5 }]).verdict).toBe("insufficient");
    expect(evaluateExperiment([{ variantId: "a", exposures: 1000, conversions: 30 }, { variantId: "b", exposures: 1000, conversions: 80 }], { minPerVariant: 500 }).verdict).toBe("winner");
    expect(evaluateExperiment([{ variantId: "a", exposures: 200, conversions: 10 }, { variantId: "b", exposures: 200, conversions: 11 }], { minPerVariant: 100 }).verdict).toBe("inconclusive");
  });
});
const d = (s: string) => new Date(s);
const base = (o: Partial<EconomicsInput> = {}): EconomicsInput => ({ now: d("2026-11-26"), windowDays: 90, visits: [], signups: [], payments: [], subscribers: [], churned: 0, refundCount: 0, refundCents: 0, generationCentsByWorkspace: {}, klyCents: 0, metaSpendCents: 0, infraMonthlyCents: 0, ...o });
describe("economics", () => {
  it("maps channels and internal accounts", () => {
    expect(channelOfTouch({ utm_source: "facebook" })).toBe("meta_paid");
    expect(channelOfTouch({ utm_source: "free_tool" })).toBe("sys_free_tools");
    expect(channelOfTouch(null)).toBe("direct");
    expect(isInternalAccount("hello+chatgpt-review@getkomendly.com")).toBe(true);
    expect(isInternalAccount("integration-testing@zapier.com")).toBe(true);
    expect(isInternalAccount("a@b.com")).toBe(false);
  });
  it("labels small samples honestly", () => {
    expect(rate(0, 0).confidence).toBe("insufficient");
    expect(rate(1, 12).confidence).toBe("estimated");
    expect(rate(30, 100).confidence).toBe("measured");
    const e = computeEconomics(base({ signups: [{ workspaceId: "w1", touch: { utm_source: "fb" }, at: d("2026-11-20"), activated: true, upsellShown: true, upsellAccepted: false }], payments: [{ workspaceId: "w1", at: d("2026-11-25"), amountCents: 900, recurring: false }], metaSpendCents: 5000 }));
    expect(e.payingCustomers).toBe(1);
    expect(e.cacCents.cents).toBe(5000);
    expect(e.cacCents.confidence).toBe("insufficient");
    expect(e.ltvCents.basis).toBe("none");
    expect(e.firstPurchaseMarginCents.cents).toBe(900 - 5000);
  });
  it("uses a labelled assumption for LTV without history", () => {
    const e = computeEconomics(base({ subscribers: [{ workspaceId: "w", monthlyCents: 29700, since: d("2026-11-01") }], payments: [{ workspaceId: "w", at: d("2026-11-01"), amountCents: 9700, recurring: true }], metaSpendCents: 10000 }));
    expect(e.ltvCents.basis).toBe("assumption");
    expect(e.ltgpToCac.confidence).toBe("estimated");
  });
});
describe("constraints", () => {
  it("ranks and shrinks small samples", () => {
    const e = computeEconomics(base({ visits: Array.from({ length: 15000 }, () => ({ touch: null, at: d("2026-11-10") })), signups: Array.from({ length: 40 }, (_, i) => ({ workspaceId: `w${i}`, touch: null, at: d("2026-11-10"), activated: i < 30, upsellShown: false, upsellAccepted: false })) }));
    const c = diagnoseConstraint(e);
    expect(c).toHaveLength(7);
    expect(c.map((x) => x.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(c[0].key).toBe("first_purchase");
    expect(diagnoseConstraint(computeEconomics(base()))[0].severity).toBeLessThanOrEqual(5);
  });
  it("low traffic is the constraint when visits are far below target, and one $9 sale never makes economics the constraint", () => {
    const e = computeEconomics(base({ visits: Array.from({ length: 900 }, () => ({ touch: null, at: d("2026-11-10") })), signups: [{ workspaceId: "w1", touch: null, at: d("2026-11-20"), activated: true, upsellShown: true, upsellAccepted: false }], payments: [{ workspaceId: "w1", at: d("2026-11-25"), amountCents: 900, recurring: false }], klyCents: 12000, generationCentsByWorkspace: { w1: 300 } }));
    const c = diagnoseConstraint(e);
    expect(c[0].key).toBe("traffic");
    const eco = c.find((x) => x.key === "economics")!;
    expect(eco.severity).toBe(1);
    expect(eco.confidence).toBe("insufficient");
  });
  it("stage is honest", () => {
    expect(businessStage({ payingCustomers: 0, totalRevenueCents: 0, mrrCents: 0, recurringCustomers: 0, newPayingLast30d: 0, weeksWithNewCustomersLast8: 0 }).index).toBe(0);
    expect(businessStage({ payingCustomers: 1, totalRevenueCents: 900, mrrCents: 0, recurringCustomers: 0, newPayingLast30d: 1, weeksWithNewCustomersLast8: 1 }).code).toBe("monetize");
  });
});

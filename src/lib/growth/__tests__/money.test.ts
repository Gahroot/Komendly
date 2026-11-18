import { describe, expect, it } from "vitest";
import { channelFunnel, healthGrid, moneyByPeriod, mrr, periodStart, recoveryCounts, todaysPayments, type Payment } from "@/lib/growth/money";
import { parseBeat } from "@/lib/growth/systems";

const now = new Date("2026-11-18T15:00:00Z"); // Wednesday
const pay = (at: string, customerId: string, amountCents: number, billing: Payment["billing"] = "ads"): Payment => ({ at: new Date(at), billing, customerId, who: customerId, what: "x", amountCents, channel: "direct" });

describe("money", () => {
  it("period starts are UTC today / Monday", () => {
    expect(periodStart("today", now)?.toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(periodStart("week", now)?.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(periodStart("all", now)).toBeNull();
  });
  it("paying, new paying and revenue per period across both billing systems", () => {
    const pays = [pay("2026-10-01T00:00:00Z", "ads:a", 4900), pay("2026-11-18T10:00:00Z", "ads:a", 4900), pay("2026-11-18T11:00:00Z", "t:b", 19700, "testimonials"), pay("2026-11-17T09:00:00Z", "ads:c", 1000)];
    const [today, week, all] = moneyByPeriod(pays, now, ["t:z"]);
    expect(today).toMatchObject({ payingCustomers: 2, newPayingCustomers: 1, revenueCents: 24600, byBilling: { ads: 4900, testimonials: 19700 } });
    expect(week).toMatchObject({ payingCustomers: 3, newPayingCustomers: 2 });
    expect(all).toMatchObject({ payingCustomers: 4, newPayingCustomers: 3, revenueCents: 30500 });
    const t = todaysPayments(pays, now);
    expect(t.map((p) => [p.customerId, p.firstPayment])).toEqual([["t:b", true], ["ads:a", false]]);
  });
  it("mrr sums both systems", () => {
    expect(mrr([{ billing: "ads", customerId: "a", monthlyCents: 4900 }, { billing: "testimonials", customerId: "b", monthlyCents: 19700 }])).toEqual({ totalCents: 24600, byBilling: { ads: 4900, testimonials: 19700 }, subscribers: 2 });
  });
  it("channel funnel with cost per paying customer (Meta spend, others $0)", () => {
    const rows = channelFunnel(
      [{ fbclid: "x" }, { fbclid: "y" }, { utm_source: "outbound" }, null],
      [{ customerId: "1", touch: { fbclid: "x" }, freeAd: true, checkout: true, paid: true }, { customerId: "2", touch: { utm_source: "recovery" }, freeAd: false, checkout: true, paid: true }],
      "channel", { meta_paid: 39500 });
    expect(rows.find((r) => r.key === "meta_paid")).toMatchObject({ visitors: 2, signups: 1, freeAds: 1, checkouts: 1, paying: 1, spendCents: 39500, costPerPayingCents: 39500 });
    expect(rows.find((r) => r.key === "sys_checkout_recovery")).toMatchObject({ paying: 1, costPerPayingCents: 0 });
    expect(rows.find((r) => r.key === "kly_email")).toMatchObject({ visitors: 1, costPerPayingCents: null });
    const sys = channelFunnel([], [{ customerId: "2", touch: { utm_source: "recovery" }, freeAd: false, checkout: true, paid: true }], "system");
    expect(sys.find((r) => r.key === "checkout_recovery")?.paying).toBe(1);
    expect(sys.find((r) => r.key === "shopify")?.paying).toBe(0);
  });
  it("recovery counts are always present (0 when none)", () => {
    expect(recoveryCounts([], [], 0, "today", now)).toEqual({ recovered: 0, lost: 0, wonBack: 0, failedPayments: 0 });
    expect(recoveryCounts([{ name: "checkout_recovered", at: now }, { name: "churned", at: new Date("2026-01-01") }], [now], 2, "all", now)).toEqual({ recovered: 1, lost: 2, wonBack: 0, failedPayments: 2 });
  });
  it("health grid covers every system; missing flag = off", () => {
    const g = healthGrid(new Map([["sys_free_tools", true]]), new Map([["free_tools", parseBeat({ lastRunAt: now.toISOString(), lastOkAt: now.toISOString(), firstRunAt: now.toISOString(), outputs: 3 })]]), now);
    expect(g.length).toBeGreaterThan(5);
    expect(g.find((r) => r.key === "free_tools")).toMatchObject({ enabled: true, health: "healthy", outputs: 3 });
    expect(g.find((r) => r.key === "shopify")?.health).toBe("off");
  });
});

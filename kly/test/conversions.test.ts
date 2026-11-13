import { describe, expect, it } from "vitest";
import { conversionUpdate, isPaidWorkspace, revenueFromEvents, syncConversions } from "../src/conversions";
import { fakeDb } from "./fakes";

const t1 = new Date("2026-10-01T00:00:00Z");
const t2 = new Date("2026-11-01T00:00:00Z");
const now = new Date("2026-11-10T00:00:00Z");

describe("revenue from AdsEvent", () => {
  it("sums paid_converted + renewed amountCents and takes the first paid time", () => {
    const r = revenueFromEvents([
      { name: "renewed", props: { amountCents: 4900 }, createdAt: t2 },
      { name: "paid_converted", props: { amountCents: 4900 }, createdAt: t1 },
      { name: "signed_up", props: { amountCents: 999 }, createdAt: t1 },
      { name: "renewed", props: {}, createdAt: t2 },
    ]);
    expect(r).toEqual({ revenueCents: 9800, firstPaidAt: t1 });
  });
  it("paid workspace needs a non-trial plan with a live subscription", () => {
    expect(isPaidWorkspace({ adsPlan: "pro", subscriptionStatus: "active", suspendedAt: null })).toBe(true);
    expect(isPaidWorkspace({ adsPlan: "trial", subscriptionStatus: "active", suspendedAt: null })).toBe(false);
    expect(isPaidWorkspace({ adsPlan: "pro", subscriptionStatus: "canceled", suspendedAt: null })).toBe(false);
  });
  it("lead update: signup -> paid with revenue; never downgrades; no-op when unchanged", () => {
    const base = { status: "signed_up", signedUpAt: t1, paidAt: null, revenueCents: 0 };
    expect(conversionUpdate(base, { revenueCents: 4900, firstPaidAt: t2 }, null, now)).toEqual({ status: "paid", paidAt: t2, revenueCents: 4900 });
    expect(conversionUpdate({ ...base, status: "paid", paidAt: t2, revenueCents: 4900 }, { revenueCents: 4900, firstPaidAt: t2 }, null, now)).toBeNull();
    expect(conversionUpdate({ ...base, status: "paid", paidAt: t2 }, { revenueCents: 0, firstPaidAt: null }, null, now)).toBeNull();
  });
});

describe("syncConversions", () => {
  it("writes the lead and bumps daily revenue by the delta", async () => {
    const f = fakeDb({
      outboundLead: { findMany: (a) => ((a as { where: { workspaceId: unknown } }).where.workspaceId === null ? [] : [{ id: "L1", workspaceId: "W1", status: "signed_up", signedUpAt: t1, paidAt: null, revenueCents: 1000 }]) },
      adsEvent: { findMany: () => [{ name: "paid_converted", props: { amountCents: 4900 }, createdAt: t2 }] },
      adsWorkspace: { findUnique: () => ({ adsPlan: "pro", subscriptionStatus: "active", suspendedAt: null }) },
    });
    expect(await syncConversions(f.db, now)).toBe(1);
    expect(f.of("outboundLead", "update")).toEqual([{ where: { id: "L1" }, data: { status: "paid", paidAt: t2, revenueCents: 4900 } }]);
    expect(f.of("klyDaily", "upsert")).toContainEqual(expect.objectContaining({ update: { revenueCents: { increment: 3900 } } }));
  });
});

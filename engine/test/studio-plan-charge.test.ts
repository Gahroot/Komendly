import { describe, expect, it } from "vitest";
import { decideCharge } from "../src/studio/charge";

const ws = (over: Partial<Parameters<typeof decideCharge>[0]> = {}) => ({ adsPlan: "ad_department", subscriptionStatus: "active", suspendedAt: null, creditBalance: 0, studioFreeVideos: 0, ...over });

// Owner decision 2026-11-13: no unlimited plans. Ad Department (20x Starter credits) pays for Studio like any plan.
describe("studio charge on Ad Department (no longer unlimited)", () => {
  it("charges credits on Ad Department and refuses at 0 balance", () => {
    expect(decideCharge(ws({ creditBalance: 1200 }), { priorRenders: 0, seconds: 10, sessionFree: false }).deducted).toBe(5);
    expect(decideCharge(ws(), { priorRenders: 0, seconds: 45, sessionFree: false }).insufficient).toBe(true);
  });
  it("charges normally once the subscription is not active, and on other plans", () => {
    expect(decideCharge(ws({ subscriptionStatus: "canceled", creditBalance: 10 }), { priorRenders: 0, seconds: 10, sessionFree: false }).deducted).toBe(5);
    expect(decideCharge(ws({ adsPlan: "starter", creditBalance: 10 }), { priorRenders: 0, seconds: 10, sessionFree: false }).deducted).toBe(5);
  });
});

describe("studio charge during an Unlimited week", () => {
  it("is free and clean until the pass ends, then charges again", () => {
    const until = new Date(Date.now() + 86_400_000);
    expect(decideCharge(ws({ unlimitedUntil: until }), { priorRenders: 0, seconds: 45, sessionFree: false })).toMatchObject({ credits: 0, deducted: 0, insufficient: false, watermark: false });
    expect(decideCharge(ws({ unlimitedUntil: new Date(Date.now() - 1000), creditBalance: 10 }), { priorRenders: 0, seconds: 10, sessionFree: false }).deducted).toBe(5);
  });
});

import { describe, expect, it } from "vitest";
import { decideCharge, type ChargeWorkspace } from "../src/studio/charge";
import { AUTOPILOT_VIDEO_PRIORITY } from "../../src/lib/ads/autopilot";
import { AGE_CAP } from "../src/queue/fairness";
import { PRIORITY_PLAN_BOOST } from "../src/queue/queue";

const ws = (o: Partial<ChargeWorkspace> = {}): ChargeWorkspace => ({ adsPlan: "ad_department", subscriptionStatus: "active", suspendedAt: null, creditBalance: 0, studioFreeVideos: 1, ...o });

describe("autopilot studio charge", () => {
  it("Ad Department / Agency: free, clean, never spends the free video or credits", () => {
    for (const plan of ["ad_department", "agency"]) {
      expect(decideCharge(ws({ adsPlan: plan, creditBalance: 50 }), { priorRenders: 0, seconds: 15, sessionFree: false, autopilot: true })).toEqual({ kind: "new", credits: 0, useFreeVideo: false, watermark: false, deducted: 0, insufficient: false });
    }
    expect(decideCharge(ws(), { priorRenders: 5, seconds: 15, sessionFree: false, autopilot: true })).toMatchObject({ kind: "revision", deducted: 0, watermark: false });
  });
  it("plan lapsed or credit plan: still never charged, watermarked", () => {
    expect(decideCharge(ws({ subscriptionStatus: "canceled", creditBalance: 50 }), { priorRenders: 0, seconds: 15, sessionFree: false, autopilot: true })).toMatchObject({ deducted: 0, credits: 0, watermark: true, useFreeVideo: false });
    expect(decideCharge(ws({ adsPlan: "growth", creditBalance: 50 }), { priorRenders: 0, seconds: 15, sessionFree: false, autopilot: true })).toMatchObject({ deducted: 0, watermark: true });
  });
  it("without the autopilot flag pricing is unchanged", () => {
    expect(decideCharge(ws({ adsPlan: "growth", creditBalance: 50 }), { priorRenders: 0, seconds: 15, sessionFree: false })).toMatchObject({ deducted: 5 });
  });
  it("weekly video queues below any customer job even after max aging and plan boost", () => {
    expect(AUTOPILOT_VIDEO_PRIORITY + AGE_CAP + PRIORITY_PLAN_BOOST).toBeLessThan(0);
  });
});

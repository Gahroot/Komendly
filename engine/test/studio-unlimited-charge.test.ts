import { describe, expect, it } from "vitest";
import { decideCharge } from "../src/studio/charge";

const ws = (over: Partial<Parameters<typeof decideCharge>[0]> = {}) => ({ adsPlan: "ad_department", subscriptionStatus: "active", suspendedAt: null, creditBalance: 0, studioFreeVideos: 0, ...over });

describe("studio charge on the unlimited plan", () => {
  it("charges 0 credits for new videos and revisions, with no watermark, even at 0 balance", () => {
    for (const priorRenders of [0, 1, 10]) {
      const d = decideCharge(ws(), { priorRenders, seconds: 45, sessionFree: false });
      expect(d).toMatchObject({ credits: 0, deducted: 0, insufficient: false, watermark: false, useFreeVideo: false });
    }
  });
  it("charges normally once the subscription is not active, and on other plans", () => {
    expect(decideCharge(ws({ subscriptionStatus: "canceled", creditBalance: 10 }), { priorRenders: 0, seconds: 10, sessionFree: false }).deducted).toBe(5);
    expect(decideCharge(ws({ adsPlan: "starter", creditBalance: 10 }), { priorRenders: 0, seconds: 10, sessionFree: false }).deducted).toBe(5);
  });
});

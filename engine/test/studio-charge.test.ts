import { describe, expect, it } from "vitest";
import { decideCharge, isPaidStudioWorkspace, type ChargeWorkspace } from "../src/studio/charge";

const ws = (o: Partial<ChargeWorkspace> = {}): ChargeWorkspace => ({ adsPlan: "trial", subscriptionStatus: "none", suspendedAt: null, creditBalance: 0, studioFreeVideos: 1, ...o });

describe("studio charge", () => {
  it("paid = real plan with an active status, or any credit balance", () => {
    expect(isPaidStudioWorkspace(ws())).toBe(false);
    expect(isPaidStudioWorkspace(ws({ adsPlan: "growth", subscriptionStatus: "active" }))).toBe(true);
    expect(isPaidStudioWorkspace(ws({ adsPlan: "growth", subscriptionStatus: "canceled" }))).toBe(false);
    expect(isPaidStudioWorkspace(ws({ adsPlan: "growth", subscriptionStatus: "active", suspendedAt: new Date(0) }))).toBe(false);
    expect(isPaidStudioWorkspace(ws({ creditBalance: 3 }))).toBe(true);
  });
  it("first render on a free workspace spends the free video, no watermark, 0 credits", () => {
    expect(decideCharge(ws(), { priorRenders: 0, seconds: 12, sessionFree: false })).toEqual({ kind: "new", credits: 0, useFreeVideo: true, watermark: false, deducted: 0, insufficient: false });
  });
  it("paid new video: 5 credits short, 8 long, no watermark", () => {
    expect(decideCharge(ws({ creditBalance: 20 }), { priorRenders: 0, seconds: 30, sessionFree: false })).toMatchObject({ credits: 5, deducted: 5, watermark: false });
    expect(decideCharge(ws({ creditBalance: 20 }), { priorRenders: 0, seconds: 31, sessionFree: false })).toMatchObject({ credits: 8, deducted: 8, watermark: false });
  });
  it("revisions: 3 included, then 1 credit; free session revisions are clean too", () => {
    expect(decideCharge(ws(), { priorRenders: 1, seconds: 10, sessionFree: true })).toMatchObject({ kind: "revision", deducted: 0, watermark: false });
    expect(decideCharge(ws({ creditBalance: 4 }), { priorRenders: 3, seconds: 10, sessionFree: false })).toMatchObject({ deducted: 0, watermark: false });
    expect(decideCharge(ws({ creditBalance: 4 }), { priorRenders: 4, seconds: 10, sessionFree: false })).toMatchObject({ deducted: 1, watermark: false });
  });
  it("never goes negative: short balance delivers watermarked and charges nothing", () => {
    expect(decideCharge(ws({ adsPlan: "growth", subscriptionStatus: "active", creditBalance: 2, studioFreeVideos: 0 }), { priorRenders: 0, seconds: 10, sessionFree: false })).toMatchObject({ credits: 5, deducted: 0, insufficient: true, watermark: true });
  });
});

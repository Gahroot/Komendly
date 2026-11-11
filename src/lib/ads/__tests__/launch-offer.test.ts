import { describe, expect, it } from "vitest";
import {
  getOffer,
  isLaunchOfferOpen,
  LAUNCH_QUARTER,
  launchOfferExpiresAt,
  offerCreditsFor,
  offerFromPriceId,
  offerSavingsCents,
} from "../billing-config";
import { marginAt, P90_PER_CREDIT } from "../../../../scripts/ads-pricing-sim";

const ready = new Date("2026-11-07T12:00:00Z");
const h = (n: number) => new Date(ready.getTime() + n * 3_600_000);

describe("launch quarter offer", () => {
  it("is $129 for 3 months of 60 credits, +5 on the first invoice only", () => {
    expect(LAUNCH_QUARTER.priceCents).toBe(12900);
    expect(offerCreditsFor(LAUNCH_QUARTER, true)).toBe(65);
    expect(offerCreditsFor(LAUNCH_QUARTER, false)).toBe(60);
    expect(offerSavingsCents(LAUNCH_QUARTER)).toBe(1800);
  });

  it("keeps >= 70% margin at p90 API cost on the bonus quarter", () => {
    expect(marginAt(129, 65, P90_PER_CREDIT)).toBeGreaterThanOrEqual(0.7);
  });

  it("is open for exactly 72h after the trial ads are ready", () => {
    expect(launchOfferExpiresAt(ready)?.toISOString()).toBe("2026-11-10T12:00:00.000Z");
    expect(isLaunchOfferOpen(ready, h(0))).toBe(true);
    expect(isLaunchOfferOpen(ready, h(71.9))).toBe(true);
    expect(isLaunchOfferOpen(ready, h(72))).toBe(false);
    expect(isLaunchOfferOpen(ready, h(-1))).toBe(false);
    expect(isLaunchOfferOpen(null, h(1))).toBe(false);
  });

  it("resolves by key and price id", () => {
    expect(getOffer("launch_quarter")).toBe(LAUNCH_QUARTER);
    expect(getOffer("starter")).toBeUndefined();
    expect(offerFromPriceId("price_x", { STRIPE_ADS_LAUNCH_QUARTER_PRICE_ID: "price_x" })).toBe(LAUNCH_QUARTER);
    expect(offerFromPriceId("price_x", {})).toBeUndefined();
  });
});

describe("launch quarter window start + one offer at a time", () => {
  it("opens at the 3rd ready ad, or at completion if sooner", async () => {
    const { launchOfferReadyAt } = await import("../billing-config");
    expect(launchOfferReadyAt([h(3), h(1), h(2)], null)?.toISOString()).toBe(h(3).toISOString());
    expect(launchOfferReadyAt([h(1), h(2)], null)).toBeNull();
    expect(launchOfferReadyAt([h(1), h(2)], h(5))?.toISOString()).toBe(h(5).toISOString());
    expect(launchOfferReadyAt([h(1), h(2), h(3)], h(2.5))?.toISOString()).toBe(h(2.5).toISOString());
  });
  it("shows Launch Quarter first, then the unlock pack only when bonus ads are locked", async () => {
    const { trialOfferStage } = await import("../offer-value");
    const base = { trialUnpaid: true, readyAds: 3, minReady: 3, launchOpen: true, launchDismissed: false, bonusLocked: true, unlockAvailable: true };
    expect(trialOfferStage(base)).toBe("launch_quarter");
    expect(trialOfferStage({ ...base, readyAds: 2 })).toBe("none");
    expect(trialOfferStage({ ...base, trialUnpaid: false })).toBe("none");
    expect(trialOfferStage({ ...base, launchDismissed: true })).toBe("unlock_pack");
    expect(trialOfferStage({ ...base, launchOpen: false })).toBe("unlock_pack");
    expect(trialOfferStage({ ...base, launchOpen: false, bonusLocked: false })).toBe("none");
    expect(trialOfferStage({ ...base, launchOpen: false, unlockAvailable: false })).toBe("none");
  });
});

describe("offer UI waits for the server's Launch Quarter state (regression: run cmwc7iamu00066ur5udk9p0vo)", () => {
  it("does not render trial offers before the workspace and offer state are loaded", async () => {
    const { offerStateSettled, trialOfferStage } = await import("../offer-value");
    const trial = { isTrial: true, isPaid: false };
    expect(offerStateSettled({ ...trial, workspaceLoaded: false, offerSettled: false })).toBe(false);
    expect(offerStateSettled({ ...trial, workspaceLoaded: true, offerSettled: false })).toBe(false);
    expect(offerStateSettled({ ...trial, workspaceLoaded: true, offerSettled: true })).toBe(true);
    expect(offerStateSettled({ isTrial: true, isPaid: true, workspaceLoaded: true, offerSettled: false })).toBe(true);
    expect(offerStateSettled({ isTrial: false, isPaid: false, workspaceLoaded: false, offerSettled: false })).toBe(true);
    // Once settled, a user inside the window (3rd ready ad 14:23:38, back at 15:21) gets the Launch Quarter.
    const { isLaunchOfferOpen, launchOfferReadyAt } = await import("../billing-config");
    const at = launchOfferReadyAt([new Date("2026-11-11T14:23:14Z"), new Date("2026-11-11T14:23:34Z"), new Date("2026-11-11T14:23:38Z")], new Date("2026-11-11T14:58:22Z"));
    const open = isLaunchOfferOpen(at, new Date("2026-11-11T15:21:11Z"));
    expect(open).toBe(true);
    expect(trialOfferStage({ trialUnpaid: true, readyAds: 10, minReady: 3, launchOpen: open, launchDismissed: false, bonusLocked: true, unlockAvailable: true })).toBe("launch_quarter");
  });
});

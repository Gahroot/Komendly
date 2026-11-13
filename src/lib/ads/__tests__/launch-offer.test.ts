import { describe, expect, it } from "vitest";
import {
  getOffer,
  isLaunchOfferOpen,
  LAUNCH_QUARTER,
  LAUNCH_QUARTER_LEGACY,
  launchOfferExpiresAt,
  offerCouponId,
  offerFirstPaymentCents,
  offerCreditsFor,
  offerFromPriceId,
  offerSavingsCents,
} from "../billing-config";
import { marginAt, P90_PER_CREDIT } from "../../../../scripts/ads-pricing-sim";

const ready = new Date("2026-11-07T12:00:00Z");
const h = (n: number) => new Date(ready.getTime() + n * 3_600_000);

describe("launch quarter offer", () => {
  it("is the first month of Ozzy Ad Department for $97 ($100 off $197, once), renewing as the plan", () => {
    expect(LAUNCH_QUARTER).toMatchObject({ key: "launch_department", plan: "ad_department", priceCents: 19700, intervalMonths: 1, priceEnv: "STRIPE_ADS_AD_DEPARTMENT_PRICE_ID" });
    expect(offerFirstPaymentCents(LAUNCH_QUARTER)).toBe(9700);
    expect(offerSavingsCents(LAUNCH_QUARTER)).toBe(10000);
    expect(offerCreditsFor(LAUNCH_QUARTER, true)).toBe(0);
    expect(offerCouponId(LAUNCH_QUARTER, { STRIPE_ADS_LAUNCH_FIRST_MONTH_COUPON_ID: "c" })).toBe("c");
  });

  it("keeps the legacy Launch Quarter ($129, 60 + 5 credits) for existing subscribers at >= 70% margin", () => {
    expect(offerCreditsFor(LAUNCH_QUARTER_LEGACY, true)).toBe(65);
    expect(offerCreditsFor(LAUNCH_QUARTER_LEGACY, false)).toBe(60);
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
    expect(getOffer("launch_department")).toBe(LAUNCH_QUARTER);
    expect(getOffer("launch_quarter")).toBe(LAUNCH_QUARTER_LEGACY);
    expect(getOffer("starter")).toBeUndefined();
    // Legacy price id still maps (renewals); the coupon offer rides on the plan price and never matches as an offer.
    expect(offerFromPriceId("price_x", { STRIPE_ADS_LAUNCH_QUARTER_PRICE_ID: "price_x" })).toBe(LAUNCH_QUARTER_LEGACY);
    expect(offerFromPriceId("price_ad", { STRIPE_ADS_AD_DEPARTMENT_PRICE_ID: "price_ad" })).toBeUndefined();
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

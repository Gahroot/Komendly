import { describe, expect, it } from "vitest";
import { autopilotOfferCopy, offerHonestyText, rooferOfferStage, usesAutopilotOffer } from "../roofer-offer";
import { normalizeTrade, tradeFromEventProps, tradeFromPath } from "../trade";
import { workspaceTrade } from "../trade-server";

const base = { trialUnpaid: true, readyAds: 3, minReady: 3, autopilotAvailable: true, autopilotDeclined: false, launchOpen: true, launchDismissed: false, bonusLocked: true, unlockAvailable: true };

describe("rooferOfferStage", () => {
  it("shows nothing before the ads are ready or for paid workspaces", () => {
    expect(rooferOfferStage({ ...base, readyAds: 2 })).toBe("none");
    expect(rooferOfferStage({ ...base, trialUnpaid: false })).toBe("none");
  });
  it("leads with Growth Autopilot, then Ad Department, then the $9 unlock", () => {
    expect(rooferOfferStage(base)).toBe("autopilot");
    expect(rooferOfferStage({ ...base, autopilotDeclined: true })).toBe("launch_quarter");
    expect(rooferOfferStage({ ...base, autopilotDeclined: true, launchDismissed: true })).toBe("unlock_pack");
    expect(rooferOfferStage({ ...base, autopilotDeclined: true, launchOpen: false })).toBe("unlock_pack");
    expect(rooferOfferStage({ ...base, autopilotDeclined: true, launchDismissed: true, bonusLocked: false })).toBe("none");
    expect(rooferOfferStage({ ...base, autopilotDeclined: true, launchDismissed: true, unlockAvailable: false })).toBe("none");
  });
  it("skips Autopilot when it can't be bought", () => {
    expect(rooferOfferStage({ ...base, autopilotAvailable: false })).toBe("launch_quarter");
  });
  it("applies only to roofers", () => {
    expect(usesAutopilotOffer("roofers")).toBe(true);
    expect(usesAutopilotOffer("plumbers")).toBe(false);
    expect(usesAutopilotOffer(null)).toBe(false);
  });
});

describe("autopilot offer copy", () => {
  it("states the founding terms and makes no results promises", () => {
    const c = autopilotOfferCopy();
    expect(c.price).toBe("$297/month");
    expect(c.priceNote).toContain("$497");
    expect(c.scarcity).toContain("10");
    const text = offerHonestyText();
    expect(text).not.toMatch(/guarantee|ROI|waiting on Meta|coming soon|\b\d+\s+leads\b|booked jobs/i);
  });
});

describe("trade attribution", () => {
  it("accepts only known industry slugs", () => {
    expect(normalizeTrade(" Roofers ")).toBe("roofers");
    expect(normalizeTrade("roofers<script>")).toBeNull();
    expect(normalizeTrade(undefined)).toBeNull();
    expect(tradeFromPath("/free-ads/roofers")).toBe("roofers");
    expect(tradeFromPath("/free-ads/roofers?utm_source=fb")).toBe("roofers");
    expect(tradeFromPath("/free-ads")).toBeNull();
    expect(tradeFromPath("/free-ads/from/abc")).toBeNull();
    expect(tradeFromEventProps({ trade: "roofers", via: "signup" })).toBe("roofers");
    expect(tradeFromEventProps(null)).toBeNull();
  });
  it("workspaceTrade reads the first trade_tagged event", async () => {
    let asked = "";
    expect(await workspaceTrade("ws1", async (id) => { asked = id; return { props: { trade: "roofers" } }; })).toBe("roofers");
    expect(asked).toBe("ws1");
    expect(await workspaceTrade("ws2", async () => null)).toBeNull();
    expect(await workspaceTrade("ws3", async () => ({ props: { trade: "not-a-trade" } }))).toBeNull();
    expect(await workspaceTrade("ws4", async () => { throw new Error("db down"); })).toBeNull();
  });
});

describe("autopilot spots line", () => {
  it("shows spots left only once some are taken", () => {
    expect(autopilotOfferCopy(null).scarcity).toBe("First 10 roofing companies only.");
    expect(autopilotOfferCopy(10).scarcity).toBe("First 10 roofing companies only.");
    expect(autopilotOfferCopy(1).scarcity).toBe("First 10 roofing companies only (1 spot left).");
  });
});

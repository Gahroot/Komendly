import { describe, expect, it } from "vitest";
import { BUFFER_DAYS, discoveryNeed, giftAllowance, spendStop } from "../src/loop";
import { statusOf } from "../src/main";
import { newLoopState } from "../src/loop";

const gate = { dailyGiftCap: 40, giftsToday: 0, overBudget: false, codexPct: 10, maxCodexWeeklyPct: 60 };

describe("budget and Codex usage stops", () => {
  it("stops gifts over the monthly budget", () => {
    expect(giftAllowance({ ...gate, overBudget: true })).toEqual({ allowed: 0, reason: "monthly budget reached" });
  });
  it("stops gifts at the Codex weekly cap; unknown usage does not block", () => {
    expect(giftAllowance({ ...gate, codexPct: 60 }).allowed).toBe(0);
    expect(spendStop({ overBudget: false, codexPct: 61, maxCodexWeeklyPct: 60 })).toMatch(/Codex weekly usage/);
    expect(giftAllowance({ ...gate, codexPct: null }).allowed).toBeGreaterThan(0);
  });
  it("respects the daily gift cap and the per-tick limit", () => {
    expect(giftAllowance({ ...gate, giftsToday: 40 })).toEqual({ allowed: 0, reason: "daily gift cap reached" });
    expect(giftAllowance({ ...gate, giftsToday: 38 }).allowed).toBe(2);
    expect(giftAllowance(gate, 5).allowed).toBe(5);
  });
});

describe("lead buffer", () => {
  it("tops up to ~2 days of sending capacity", () => {
    expect(BUFFER_DAYS).toBe(2);
    expect(discoveryNeed(10, 15, 100)).toBe(5);
    expect(discoveryNeed(10, 25)).toBe(0);
    expect(discoveryNeed(80, 0, 10)).toBe(10);
  });
});

describe("health status", () => {
  it("waits for mailboxes when none are configured", () => {
    const s = statusOf(newLoopState(), { OUTBOUND_ENABLED: "1" }, true);
    expect(s.state).toBe("waiting for mailboxes");
    expect(s.outboundEnabled).toBe(false);
  });
});

import { giftHeadroom, IDLE_GIFT_STOCK } from "../src/loop";
describe("giftHeadroom", () => {
  it("keeps only a small stock while sending is not live", () => {
    expect(giftHeadroom(false, 80, 0)).toBe(IDLE_GIFT_STOCK);
    expect(giftHeadroom(false, 80, IDLE_GIFT_STOCK)).toBe(0);
  });
  it("buffers about two days of volume when live", () => {
    expect(giftHeadroom(true, 10, 5)).toBe(15);
    expect(giftHeadroom(true, 10, 30)).toBe(0);
  });
});

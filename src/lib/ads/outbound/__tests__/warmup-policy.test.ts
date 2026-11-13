import { describe, expect, it } from "vitest";
import { canSendNow, coldRampLimit, mailboxDayLimit, spamPlacementRate, warmupReadiness } from "../policy";

const DAY = 86_400_000;
const now = new Date("2026-12-10T17:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const box = { provider: "maildoso", dailyCap: 15, warmupStartedAt: ago(30), readyAt: ago(1) };

describe("warm-up readiness gate", () => {
  it("needs 14 full days of warm-up", () => {
    expect(warmupReadiness({ since: ago(10), spamRate: 0, coldStartedAt: null }, now).ready).toBe(false);
    expect(warmupReadiness({ since: null, spamRate: 0, coldStartedAt: null }, now).ready).toBe(false);
    expect(warmupReadiness({ since: ago(14), spamRate: 0.02, coldStartedAt: null }, now).ready).toBe(true);
  });
  it("needs a measured spam rate under the threshold", () => {
    expect(warmupReadiness({ since: ago(20), spamRate: null, coldStartedAt: null }, now).ready).toBe(false);
    expect(warmupReadiness({ since: ago(20), spamRate: 0.1, coldStartedAt: null }, now).ready).toBe(false);
    expect(warmupReadiness({ since: ago(20), spamRate: 0.15, coldStartedAt: null, maxSpamRate: 0.2 }, now).ready).toBe(true);
    expect(spamPlacementRate(10, 1)).toBeNull();
    expect(spamPlacementRate(90, 10)).toBeCloseTo(0.1);
  });
  it("extends mailboxDayLimit / canSendNow and ramps cold 5 -> 10 -> cap", () => {
    expect(mailboxDayLimit({ ...box, warmup: { since: ago(5), spamRate: 0, coldStartedAt: null } }, now)).toBe(0);
    expect(mailboxDayLimit({ ...box, warmup: { since: ago(20), spamRate: 0, coldStartedAt: null } }, now)).toBe(5);
    expect(mailboxDayLimit({ ...box, warmup: { since: ago(20), spamRate: 0, coldStartedAt: ago(1) } }, now)).toBe(10);
    expect(coldRampLimit(ago(3), now, 15)).toBe(15);
    expect(mailboxDayLimit(box, now)).toBe(15); // not in Kly warm-up: vendor readyAt only
    const pace = { ...box, paused: false, lastSentAt: null, sentToday: 0, gapMs: 0 };
    expect(canSendNow({ ...pace, warmup: { since: ago(5), spamRate: 0, coldStartedAt: null } }, now)).toEqual({ ok: false, reason: "not_ready" });
    expect(canSendNow({ ...pace, warmup: { since: ago(20), spamRate: 0, coldStartedAt: null } }, now)).toEqual({ ok: true });
  });
});

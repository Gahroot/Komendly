import { describe, expect, it } from "vitest";
import { GIFT_ATTEMPT_CAP, GIFT_FILL_MAX_MS, giftPolicy } from "../src/jobs/gift-policy";
import { expiryAmount, utcMonthStart, type RewardGrant } from "../src/jobs/referral";
import { attemptCap } from "../src/jobs/replace";
import { fallbackFor, withinFillWindow } from "../src/jobs/trial-fill";
import { giftEmailCopy, referralEmailCopy } from "../src/lifecycle/growth";

const gift = { kind: "gift", isTrial: false, staticCount: 3, motionCount: 0 };

describe("gift run policy", () => {
  it("no trial claim, no credits, no motion, no bonus, auto-confirm", () => {
    const p = giftPolicy(gift);
    expect(p).toMatchObject({ autoConfirm: true, claimTrial: false, credits: false, bonus: false });
    expect(p.motionCount(2)).toBe(0);
    const t = giftPolicy({ kind: "standard", isTrial: true });
    expect(t).toMatchObject({ autoConfirm: false, claimTrial: true, credits: true, bonus: true });
    expect(t.motionCount(1)).toBe(1);
  });
  it("small attempt cap instead of the trial full-pack budget", () => {
    expect(attemptCap("static", gift)).toBe(GIFT_ATTEMPT_CAP);
    expect(attemptCap("motion", { ...gift, motionCount: 1 })).toBe(0);
    expect(attemptCap("static", { ...gift, kind: "standard", isTrial: true, staticCount: 20 })).toBe(40);
  });
  it("10 minute fill window from confirm", () => {
    const confirmedAt = new Date("2026-01-01T00:00:00Z");
    expect(withinFillWindow({ ...gift, confirmedAt }, new Date(confirmedAt.getTime() + GIFT_FILL_MAX_MS - 1))).toBe(true);
    expect(withinFillWindow({ ...gift, confirmedAt }, new Date(confirmedAt.getTime() + GIFT_FILL_MAX_MS + 1))).toBe(false);
  });
  it("replacements go template, last attempt typographic", () => {
    expect(fallbackFor(gift, 3, 6)).toBeNull();
    expect(fallbackFor(gift, 4, 6)).toBe("template");
    expect(fallbackFor(gift, 5, 6)).toBe("type");
  });
});

describe("referral expiry amount", () => {
  const d = (day: number) => new Date(Date.UTC(2026, 0, day));
  const g = (id: string, from: number, to: number, delta = 10): RewardGrant => ({ id, delta, createdAt: d(from), expiresAt: d(to) });
  it("nothing spent: whole reward expires, clamped to balance", () => {
    expect(expiryAmount(g("a", 1, 31), [g("a", 1, 31)], [], 50)).toBe(10);
    expect(expiryAmount(g("a", 1, 31), [g("a", 1, 31)], [], 4)).toBe(4);
  });
  it("spend draws from the reward first; releases give back", () => {
    const a = g("a", 1, 31);
    expect(expiryAmount(a, [a], [{ delta: -6, createdAt: d(5) }], 100)).toBe(4);
    expect(expiryAmount(a, [a], [{ delta: -6, createdAt: d(5) }, { delta: 2, createdAt: d(6) }], 100)).toBe(6);
    expect(expiryAmount(a, [a], [{ delta: -30, createdAt: d(5) }], 100)).toBe(0);
  });
  it("ignores spend before the grant and after expiry", () => {
    const a = g("a", 10, 20);
    expect(expiryAmount(a, [a], [{ delta: -5, createdAt: d(5) }, { delta: -5, createdAt: d(25) }], 100)).toBe(10);
  });
  it("earlier-expiring rewards are consumed first", () => {
    const a = g("a", 1, 15);
    const b = g("b", 2, 20);
    const moves = [{ delta: -12, createdAt: d(3) }];
    expect(expiryAmount(a, [a, b], moves, 100)).toBe(0);
    expect(expiryAmount(b, [a, b], moves, 100)).toBe(8);
  });
  it("utc month start", () => {
    expect(utcMonthStart(new Date("2026-03-31T23:59:59Z")).toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("growth email copy", () => {
  it("fixed copy", () => {
    expect(giftEmailCopy("Lakeside Roofing", 3).subject).toBe("Your gift for Lakeside Roofing is ready");
    expect(giftEmailCopy("Lakeside Roofing", 3).ctaLabel).toBe("Copy your gift link");
    const r = referralEmailCopy(10, new Date("2026-12-09T00:00:00Z"));
    expect(r.subject).toBe("You earned 10 free ads");
    expect(r.paragraphs.join(" ")).toContain("December 9, 2026");
  });
});

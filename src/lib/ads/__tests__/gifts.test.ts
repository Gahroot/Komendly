import { describe, expect, it } from "vitest";
import { decideGiftQuota, isBotUserAgent, isGiftToken, isOwnDomain, monthStart, newGiftToken, type GiftQuotaInput } from "../gifts";

const q = (o: Partial<GiftQuotaInput>): GiftQuotaInput => ({ isAdmin: false, partnerPerMonth: null, isPaid: false, total: 0, monthBySource: {}, ...o });

describe("gift quotas", () => {
  it("trial: 1 gift total", () => {
    expect(decideGiftQuota(q({}))).toMatchObject({ ok: true, source: "trial_ready" });
    expect(decideGiftQuota(q({ total: 1 }))).toMatchObject({ ok: false, perk: "trial" });
  });
  it("paid: 1 per calendar month", () => {
    expect(decideGiftQuota(q({ isPaid: true, total: 4 }))).toMatchObject({ ok: true, source: "paid_monthly" });
    expect(decideGiftQuota(q({ isPaid: true, monthBySource: { paid_monthly: 1 } }))).toMatchObject({ ok: false, perk: "paid" });
    expect(decideGiftQuota(q({ isPaid: true, paidPerMonth: 4, monthBySource: { paid_monthly: 3 } }))).toEqual({ ok: true, source: "paid_monthly", remaining: 0 });
  });
  it("partners get demo gifts per month, then fall back to the paid perk", () => {
    expect(decideGiftQuota(q({ partnerPerMonth: 3, monthBySource: { partner_demo: 2 } }))).toEqual({ ok: true, source: "partner_demo", remaining: 0 });
    expect(decideGiftQuota(q({ partnerPerMonth: 3, isPaid: true, monthBySource: { partner_demo: 3 } }))).toMatchObject({ ok: true, source: "paid_monthly" });
  });
  it("admins are unlimited", () => {
    expect(decideGiftQuota(q({ isAdmin: true, total: 999 }))).toEqual({ ok: true, source: "admin_outreach", remaining: null });
  });
  it("month starts on the 1st (UTC)", () => {
    expect(monthStart(new Date("2026-11-09T12:00:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("gift safety", () => {
  it("blocks gifting your own domain", () => {
    expect(isOwnDomain("www.acme.com", { email: "me@acme.com", brandDomains: [] })).toBe(true);
    expect(isOwnDomain("shop.mybrand.co.uk", { email: "me@gmail.com", brandDomains: ["mybrand.co.uk"] })).toBe(true);
    expect(isOwnDomain("joesbakery.com", { email: "me@gmail.com", brandDomains: ["acme.com"] })).toBe(false);
  });
  it("tokens are 16 url-safe chars", () => {
    const t = newGiftToken();
    expect(isGiftToken(t)).toBe(true);
    expect(isGiftToken("short")).toBe(false);
  });
  it("detects bots and link unfurlers", () => {
    expect(isBotUserAgent("facebookexternalhit/1.1")).toBe(true);
    expect(isBotUserAgent("WhatsApp/2.23")).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false);
  });
});

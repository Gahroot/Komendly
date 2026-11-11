import { describe, expect, it } from "vitest";
import { capExpiring, decideReferral, freeMonthState, friendLabel, isReferralCode, makeReferralCode, trialStaticFor, type ReferralParty } from "../referrals";
import { isTrialStartInvoice, statusAfterCheckout } from "../referral-billing";

const party = (o: Partial<ReferralParty>): ReferralParty => ({ workspaceId: "w1", userId: "u1", email: "a@acme.com", ipHashes: [], deviceHashes: [], ...o });

describe("referral codes", () => {
  it("builds first name + 4 readable chars", () => {
    const code = makeReferralCode("Sárah Kim", () => 0);
    expect(code).toBe("sarah-aaaa");
    expect(isReferralCode(code)).toBe(true);
  });
  it("falls back for empty / symbol names and caps length", () => {
    expect(makeReferralCode(null, () => 1)).toBe("friend-bbbb");
    expect(makeReferralCode("Bartholomewsson-Long", () => 2).split("-")[0]).toHaveLength(12);
    expect(isReferralCode("../etc")).toBe(false);
  });
  it("labels friends by first name + initial", () => {
    expect(friendLabel("sam kerr")).toBe("Sam K.");
    expect(friendLabel("")).toBe("A friend");
  });
});

describe("self-referral rules", () => {
  const ref = party({ ipHashes: ["ip1"], deviceHashes: ["d1"] });
  it("accepts a different person", () => {
    expect(decideReferral(ref, party({ workspaceId: "w2", userId: "u2", email: "b@other.com" }))).toEqual({ ok: true });
  });
  it("rejects same workspace / user / email", () => {
    expect(decideReferral(ref, party({ userId: "u2", email: "z@x.com" }))).toEqual({ ok: false, reason: "self_referral" });
    expect(decideReferral(ref, party({ workspaceId: "w2", userId: "u2", email: "A+x@acme.com" }))).toEqual({ ok: false, reason: "self_referral" });
  });
  it("rejects same company domain but not webmail", () => {
    expect(decideReferral(ref, party({ workspaceId: "w2", userId: "u2", email: "c@acme.com" }))).toEqual({ ok: false, reason: "same_email_domain" });
    const gm = party({ email: "a@gmail.com" });
    expect(decideReferral(gm, party({ workspaceId: "w2", userId: "u2", email: "b@gmail.com" }))).toEqual({ ok: true });
  });
  it("rejects same device or network", () => {
    expect(decideReferral(ref, party({ workspaceId: "w2", userId: "u2", email: "b@o.com", deviceHashes: ["d1"] }))).toEqual({ ok: false, reason: "same_device" });
    expect(decideReferral(ref, party({ workspaceId: "w2", userId: "u2", email: "b@o.com", ipHashes: ["ip1"] }))).toEqual({ ok: false, reason: "same_network" });
  });
});

describe("trial size + rewards", () => {
  it("doubles the trial for referred workspaces", () => {
    expect(trialStaticFor(10, false)).toBe(10);
    expect(trialStaticFor(10, true)).toBe(20);
    expect(trialStaticFor(3, true)).toBe(20);
  });
  it("free month only after 3 rewarded, once, when not subscribed", () => {
    expect(freeMonthState({ rewardedCount: 2, isPaid: false, claimed: false })).toBe("locked");
    expect(freeMonthState({ rewardedCount: 3, isPaid: false, claimed: false })).toBe("available");
    expect(freeMonthState({ rewardedCount: 3, isPaid: true, claimed: false })).toBe("subscribed");
    expect(freeMonthState({ rewardedCount: 5, isPaid: false, claimed: true })).toBe("claimed");
  });
  it("caps expiring credits at the balance, soonest first", () => {
    const a = new Date("2026-12-01T00:00:00Z");
    const b = new Date("2026-11-20T00:00:00Z");
    expect(capExpiring([{ credits: 10, expiresAt: a }, { credits: 10, expiresAt: b }], 14)).toEqual([
      { credits: 10, expiresAt: b.toISOString() },
      { credits: 4, expiresAt: a.toISOString() },
    ]);
    expect(capExpiring([{ credits: 10, expiresAt: a }], 0)).toEqual([]);
  });
  it("webhook: free-month checkout is trialing and its $0 create invoice is a trial start", () => {
    expect(statusAfterCheckout({ kind: "referral_free_month" })).toBe("trialing");
    expect(statusAfterCheckout({ kind: "plan" })).toBe("active");
    expect(isTrialStartInvoice({ billing_reason: "subscription_create", amount_paid: 0 })).toBe(true);
    expect(isTrialStartInvoice({ billing_reason: "subscription_create", amount_paid: 4900 })).toBe(false);
    expect(isTrialStartInvoice({ billing_reason: "subscription_cycle", amount_paid: 4900 })).toBe(false);
  });
});

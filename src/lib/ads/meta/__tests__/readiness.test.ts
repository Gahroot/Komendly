import { describe, expect, it } from "vitest";
import { accountReadiness } from "../readiness";

const page = [{ id: "p1", name: "Shop" }];
const codes = (r: ReturnType<typeof accountReadiness>) => r.issues.map((i) => i.code);

describe("accountReadiness", () => {
  it("is ok for an active account with payment and a Page", () => {
    expect(accountReadiness({ id: "act_1", name: "A", status: 1, hasPayment: true }, page)).toEqual({ ok: true, issues: [] });
  });

  it("never blocks on unknown fields", () => {
    expect(accountReadiness({ id: "act_1", name: "A" }, page).ok).toBe(true);
    expect(accountReadiness({ id: "act_1", name: "A" }, null).ok).toBe(true);
  });

  it.each([
    [2, "disabled"], [3, "unpaid"], [8, "unpaid"], [9, "unpaid"], [7, "in_review"], [100, "closed"], [101, "closed"],
  ] as const)("status %i -> %s", (status, code) => {
    const r = accountReadiness({ id: "act_1", name: "A", status, hasPayment: true }, page);
    expect(r.ok).toBe(false);
    expect(codes(r)).toEqual([code]);
    expect(r.issues[0].fixUrl).toMatch(/^https:\/\//);
  });

  it("flags a missing payment method with a billing link for that account", () => {
    const r = accountReadiness({ id: "act_42", name: "A", status: 1, hasPayment: false }, page);
    expect(codes(r)).toEqual(["no_payment"]);
    expect(r.issues[0].fixUrl).toContain("asset_id=42");
  });

  it("does not stack no_payment on an unpaid account", () => {
    expect(codes(accountReadiness({ id: "act_1", name: "A", status: 3, hasPayment: false }, page))).toEqual(["unpaid"]);
  });

  it("flags no ad account and no Page", () => {
    expect(codes(accountReadiness(null, []))).toEqual(["no_ad_account", "no_page"]);
  });
});

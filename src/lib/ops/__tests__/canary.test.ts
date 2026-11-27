import { describe, expect, it } from "vitest";
import { CANARY_EMAIL, CANARY_STEPS, refusalReasons, stripeModeOf } from "../qa/canary";

const base = { baseUrl: "https://staging.example.com", email: CANARY_EMAIL, password: "x", testKey: "sk_test_abc", run: true, withPack: false };
describe("canary guards", () => {
  it("detects stripe mode from a checkout url", () => {
    expect(stripeModeOf("https://checkout.stripe.com/c/pay/cs_test_a1B2")).toBe("test");
    expect(stripeModeOf("https://checkout.stripe.com/c/pay/cs_live_a1B2")).toBe("live");
    expect(stripeModeOf("https://x.com")).toBe("unknown");
  });
  it("dry runs never refuse; real runs need account, password and a TEST key", () => {
    expect(refusalReasons({ ...base, run: false, password: null, testKey: null })).toEqual([]);
    expect(refusalReasons(base)).toEqual([]);
    expect(refusalReasons({ ...base, testKey: "sk_live_x" })[0]).toMatch(/test key/);
    expect(refusalReasons({ ...base, testKey: null })[0]).toMatch(/never touches live/);
    expect(refusalReasons({ ...base, email: "real@customer.com" })[0]).toMatch(/email must be/);
    expect(refusalReasons({ ...base, password: null })[0]).toMatch(/CANARY_PASSWORD/);
  });
  it("makes the pack step optional by default", () => {
    expect(CANARY_STEPS(false).find((s) => s.id === "pack")?.optional).toBe(true);
    expect(CANARY_STEPS(true).find((s) => s.id === "pack")?.optional).toBe(false);
  });
});

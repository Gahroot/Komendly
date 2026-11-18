import { describe, expect, it } from "vitest";
import { CT_FAIL_STREAK_ALERT, isCtTransient } from "../src/new-business";

describe("crt.sh transient errors", () => {
  it("treats timeouts, network errors, 5xx and 429 as transient", () => {
    for (const m of ["The operation was aborted due to timeout", "fetch failed", "crt.sh 502", "crt.sh 429", "connect ETIMEDOUT"]) expect(isCtTransient(new Error(m))).toBe(true);
    expect(isCtTransient(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(true);
  });
  it("does not hide real bugs", () => {
    for (const m of ["crt.sh 404", "Cannot read properties of undefined", "Invalid prisma invocation"]) expect(isCtTransient(new Error(m))).toBe(false);
    expect(CT_FAIL_STREAK_ALERT).toBeGreaterThan(1);
  });
});

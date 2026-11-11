import { describe, expect, it } from "vitest";
import { safeAppNext } from "../safe-next";

describe("safeAppNext", () => {
  it("keeps same-origin paths and rejects the rest", () => {
    expect(safeAppNext("/ads/start?url=x")).toBe("/ads/start?url=x");
    expect(safeAppNext("/studio")).toBe("/studio");
    expect(safeAppNext(null)).toBe("/dashboard");
    expect(safeAppNext("//evil.com")).toBe("/dashboard");
    expect(safeAppNext("/\\evil.com")).toBe("/dashboard");
    expect(safeAppNext("https://evil.com")).toBe("/dashboard");
    expect(safeAppNext("/login?next=/x")).toBe("/dashboard");
  });
});

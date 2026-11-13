import { describe, expect, it } from "vitest";
import { maxQcRerenders } from "../src/jobs/qc";
describe("gift QC redraws", () => {
  it("gift runs get one redraw, everything else two", () => {
    expect(maxQcRerenders({ kind: "gift" })).toBe(1);
    expect(maxQcRerenders({ kind: "standard" })).toBe(2);
    expect(maxQcRerenders({ kind: "nurture" })).toBe(2);
  });
});

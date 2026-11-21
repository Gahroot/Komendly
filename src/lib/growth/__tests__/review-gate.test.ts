import { describe, expect, it } from "vitest";
import { parseVerdict, precheck, reviewGate } from "../review-gate";

const item = { system: "ad_watch", kind: "email", itemKey: "k", content: "3 new ads from rivals. From Komendly. Unsubscribe: https://x" };

describe("review gate", () => {
  it("prechecks placeholders, promises and missing opt-out", () => {
    expect(precheck({ ...item, content: "Hi {{name}}" })).not.toHaveLength(0);
    expect(precheck({ ...item, content: "We guarantee more leads. Unsubscribe" })).toContain("promises leads/sales");
    expect(precheck({ ...item, content: "Komendly ads" })).toContain("email without opt-out");
    expect(precheck(item)).toEqual([]);
  });
  it("fails closed on junk output", () => {
    expect(parseVerdict("nope").approved).toBe(false);
    expect(parseVerdict({ approved: true, reasons: ["x"] }).approved).toBe(false);
    expect(parseVerdict('ok {"approved":true,"reasons":[],"fix":""}').approved).toBe(true);
  });
  it("approves, or revises once then drops", async () => {
    const yes = async () => ({ text: "", json: { approved: true, reasons: [], fix: "" } });
    expect((await reviewGate(yes, item)).content).toBe(item.content);
    let calls = 0;
    const no = async () => { calls++; return { text: "", json: { approved: false, reasons: ["bad"], fix: "" } }; };
    const r = await reviewGate(no, item, { revise: async () => item.content + " v2" });
    expect(r.approved).toBe(false);
    expect(calls).toBe(2);
    const thrown = await reviewGate(async () => { throw new Error("down"); }, item);
    expect(thrown.approved).toBe(false);
  });
});

describe("review gate placeholders", () => {
  it("catches %VAR%, ${x} and null values", () => {
    for (const content of ["ads for %BUSINESS_NAME%", "Plans from $null/month", "Hi ${name}"]) expect(precheck({ system: "s", kind: "listing", itemKey: "k", content })).not.toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { CAP_FLOOR, nextDomainCap } from "../src/domain-caps";

const base = { cap: 45, ceiling: 750, sends7d: 200, bounces7d: 2, complaints7d: 0, sentYesterday: 45, warmupInbox: 100, warmupSpam: 3 };

describe("nextDomainCap", () => {
  it("raises a clean, busy domain by 30%", () => expect(nextDomainCap(base)?.cap).toBe(59));
  it("never passes what the mailboxes can send", () => expect(nextDomainCap({ ...base, cap: 700, sentYesterday: 700 })?.cap).toBe(750));
  it("holds when the cap wasn't used", () => expect(nextDomainCap({ ...base, sentYesterday: 10 })).toBeNull());
  it("holds on too little data", () => expect(nextDomainCap({ ...base, sends7d: 10, bounces7d: 0 })).toBeNull());
  it("holds between the thresholds", () => expect(nextDomainCap({ ...base, bounces7d: 8 })).toBeNull());
  it("cuts on bounces", () => expect(nextDomainCap({ ...base, cap: 100, bounces7d: 12 })?.cap).toBe(60));
  it("cuts on any complaint", () => expect(nextDomainCap({ ...base, cap: 100, complaints7d: 1 })?.why).toMatch(/complaint/));
  it("cuts on warm-up spam", () => expect(nextDomainCap({ ...base, cap: 100, warmupSpam: 40 })?.cap).toBe(60));
  it("never cuts below the floor", () => expect(nextDomainCap({ ...base, cap: CAP_FLOOR, complaints7d: 1 })).toBeNull());
});

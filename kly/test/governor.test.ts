import { describe, expect, it } from "vitest";
import { governorCheck, governorVerdict, NO_POSITIVE_LIMIT } from "../src/governor";
import { autoPauseReason, MAX_BOUNCE_RATE } from "../../src/lib/ads/outbound/policy";
import { nextVolume } from "../src/autoscale";
import { fakeDb } from "./fakes";

const clean = { complaints: 0, sends7d: 500, bounces7d: 5, sendsSinceCopy: 500, positiveSinceCopy: 0 };
const now = new Date("2026-12-01T15:00:00Z");

describe("hard-rule governors", () => {
  it("bounce limit is 2%", () => {
    expect(MAX_BOUNCE_RATE).toBe(0.02);
    expect(governorVerdict(clean)).toBeNull(); // 1.0%
    expect(governorVerdict({ ...clean, bounces7d: 10 })).toBeNull(); // exactly 2%
    expect(governorVerdict({ ...clean, bounces7d: 11 })?.rule).toBe("bounce");
    const ok = { bounced: false, complained: false };
    const b = { bounced: true, complained: false };
    const spread = (n: number) => Array.from({ length: 100 }, (_, i) => (i % 30 === 10 && i / 30 < n ? b : ok));
    expect(autoPauseReason(spread(3))).toMatch(/bounce rate 3\.0%/);
    expect(autoPauseReason(spread(2))).toBeNull();
    expect(nextVolume(100, 200, { sends: 100, bounces: 3, complaints: 0, replyRate: 0, baselineReplyRate: 0 }).volume).toBe(50);
  });
  it("any spam complaint stops all sending", () => {
    expect(governorVerdict({ ...clean, complaints: 1 })?.rule).toBe("complaint");
  });
  it("2,000 sends with no positive reply stops; one positive reply keeps going", () => {
    expect(governorVerdict({ ...clean, sendsSinceCopy: NO_POSITIVE_LIMIT - 1 })).toBeNull();
    expect(governorVerdict({ ...clean, sendsSinceCopy: NO_POSITIVE_LIMIT })?.rule).toBe("no_positive");
    expect(governorVerdict({ ...clean, sendsSinceCopy: 5000, positiveSinceCopy: 1 })).toBeNull();
  });
  it("logs to KlyDecision and alerts once, saying the message needs rewriting", async () => {
    const alerts: Array<{ subject: string; text: string }> = [];
    const alert = async (subject: string, text: string) => void alerts.push({ subject, text });
    let decisions = 0;
    const f = fakeDb({
      klyArm: { findMany: () => [{ createdAt: new Date("2026-11-21T00:00:00Z"), content: { template: "x" } }] },
      outboundSend: { count: (a) => ((a as { where: { complained?: boolean; bounced?: boolean } }).where.complained || (a as { where: { bounced?: boolean } }).where.bounced ? 0 : 2400) },
      outboundLead: { count: () => 0 },
      klyDecision: { count: () => decisions, create: () => (decisions++, {}) },
    });
    const r = await governorCheck(f.db, alert, now, {});
    expect(r).toMatch(/needs rewriting/);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.subject).toMatch(/needs rewriting/);
    const created = f.of("klyDecision", "create")[0] as { data: { kind: string; data: { rule: string } } };
    expect(created.data.kind).toBe("governor");
    expect(created.data.data.rule).toBe("no_positive");
    // Still stopped next tick, but no second alert.
    expect(await governorCheck(f.db, alert, now, {})).toMatch(/needs rewriting/);
    expect(alerts).toHaveLength(1);
  });
  it("KLY_GOVERNOR_RESUME_AFTER restarts the count", async () => {
    const f = fakeDb({ klyArm: { findMany: () => [] }, outboundSend: { count: (a) => ((a as { where: { sentAt: { gte: Date } } }).where.sentAt.gte >= new Date("2026-12-01T00:00:00Z") ? 0 : 9999) } });
    expect(await governorCheck(f.db, async () => undefined, now, { KLY_GOVERNOR_RESUME_AFTER: "2026-12-01T00:00:00Z" })).toBeNull();
  });
});

import { buildOutboundEmail, checkOutboundEmail, NOLAN_COPY } from "../../src/lib/ads/outbound/copy";
describe("identity, opt-out and attribution in every cold email", () => {
  it("founder variants are openly from Komendly, and carry the opt-out (utm_source=outbound is tested in src/lib/kly/__tests__/claim.test.ts)", () => {
    const base = { businessName: "Denver Gutter Co", city: "Denver, CO", niche: "gutter installers", senderName: "Ozzy at Komendly", claimUrl: "https://www.komendly.com/g/abcdefghijklmnopqrstuv", unsubscribeUrl: "https://www.komendly.com/u/abc", postalAddress: "2211 Cole St, Birmingham, MI 48009" };
    for (const v of NOLAN_COPY) {
      const ctx = { ...base, step: (v.dimension === "body" ? 1 : 2) as 1 | 2, variant: { [v.dimension]: v.template } };
      const e = buildOutboundEmail(ctx);
      expect(checkOutboundEmail(e, ctx), v.key).toBeNull();
      expect(e.text).toContain("Komendly");
      expect(e.text).toContain(base.unsubscribeUrl);
      expect(e.text).toMatch(/Reply "stop"/);
    }
  });
});

import { describe, expect, it } from "vitest";
import { demoGiftsLeft, exampleEarnings, exampleMonthlyEarningsCents, monthStartUtc, normalizeWebsite, PartnerApplication, partnerLink, referralSourceForCode, sourceForCode } from "../partner";

describe("partner helpers", () => {
  it("10 clients on Starter ($49) = $147/month", () => {
    expect(exampleMonthlyEarningsCents(10, 4900)).toBe(14700);
    expect(exampleEarnings()[0]).toMatchObject({ clients: 10, plan: "Starter", monthlyCents: 14700, yearCents: 176400 });
  });
  it("only approved partner codes give source 'partner'", () => {
    expect(sourceForCode({ kind: "partner" }, "approved")).toBe("partner");
    expect(sourceForCode({ kind: "partner" }, "paused")).toBe("link");
    expect(sourceForCode({ kind: "customer" }, "approved")).toBe("link");
    expect(sourceForCode(null, null)).toBe("link");
  });
  it("referralSourceForCode looks up the code and never throws", async () => {
    const db = (kind: string, status: string) => ({
      adsReferralCode: { findUnique: async () => ({ kind, workspaceId: "w1" }) },
      adsPartner: { findUnique: async () => ({ status }) },
    });
    // @ts-expect-error minimal fake of the two delegates used
    expect(await referralSourceForCode(db("partner", "approved"), "abc")).toBe("partner");
    // @ts-expect-error minimal fake
    expect(await referralSourceForCode(db("customer", "approved"), "abc")).toBe("link");
    const broken = { adsReferralCode: { findUnique: async () => { throw new Error("db down"); } }, adsPartner: { findUnique: async () => null } };
    // @ts-expect-error minimal fake
    expect(await referralSourceForCode(broken, "abc")).toBe("link");
  });
  it("validates applications", () => {
    const ok = PartnerApplication.safeParse({ role: "agency", clientCount: "12", pitch: "I'll send demo packs to my clients", payoutEmail: "pay@studio.com", payoutMethod: "wise" });
    expect(ok.success && ok.data.clientCount).toBe(12);
    expect(PartnerApplication.safeParse({ role: "agency", clientCount: 3, pitch: "short", payoutEmail: "nope", payoutMethod: "wise" }).success).toBe(false);
  });
  it("normalizes websites, demo gift allowance, month start and link", () => {
    expect(normalizeWebsite("acme.studio")).toBe("https://acme.studio");
    expect(normalizeWebsite("not a site")).toBe("");
    expect(demoGiftsLeft(3, 1)).toBe(2);
    expect(demoGiftsLeft(3, 5)).toBe(0);
    expect(monthStartUtc(new Date("2026-11-09T12:00:00Z")).toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(partnerLink("https://www.komendly.com/", "sarah-k3x9")).toBe("https://www.komendly.com/r/sarah-k3x9");
  });
});

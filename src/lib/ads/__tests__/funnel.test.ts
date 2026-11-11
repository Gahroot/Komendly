import { describe, expect, it } from "vitest";
import { activeAt30d, campaignEconomics, classifyTouch, cohortsByWeek, funnelBySource, funnelTotal, weekStart, type SignupRow } from "@/lib/ads/funnel";

const now = new Date("2026-11-07T00:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 86400000);
const signup = (over: Partial<SignupRow>): SignupRow => ({
  workspaceId: "w", touch: null, signedUpAt: day(60), trialFinished: false, firstPaidAt: null, canceledAt: null,
  subscribed: false, currentlyActive: false, revenueCents: 0, revenue30dCents: 0, cost30dMicros: 0, ...over,
});
const meta = { utm_source: "facebook", utm_campaign: "c1", fbclid: "x" };

describe("classifyTouch", () => {
  it("buckets meta, blog, campaign, referral, direct", () => {
    expect(classifyTouch({ fbclid: "a" }).channel).toBe("meta_paid");
    expect(classifyTouch({ utm_source: "Instagram" }).channel).toBe("meta_paid");
    expect(classifyTouch({ utm_source: "blog", utm_campaign: "post" }).channel).toBe("blog");
    expect(classifyTouch({ utm_source: "newsletter" }).channel).toBe("campaign");
    expect(classifyTouch({ utm_source: "referral", utm_campaign: "sarah-k3x9" }).channel).toBe("ref_link");
    expect(classifyTouch({ utm_source: "gift" }).channel).toBe("gift");
    expect(classifyTouch({ utm_source: "referral", utm_medium: "gift" }).channel).toBe("gift");
    expect(classifyTouch({ utm_source: "referral", utm_medium: "partner" }).channel).toBe("partner");
    expect(classifyTouch({ utm_source: "partner" }).channel).toBe("partner");
    expect(classifyTouch({ referrer: "google.com" })).toMatchObject({ channel: "referral", source: "google.com" });
    expect(classifyTouch(null)).toEqual({ channel: "direct", source: "(direct)", campaign: "(none)", content: "(none)" });
  });
});

describe("funnelBySource", () => {
  it("counts steps, rates, 30-day retention and gross profit", () => {
    const rows = funnelBySource(
      [{ touch: meta }, { touch: meta }, { touch: meta }, { touch: meta }, { touch: null }],
      [
        signup({ touch: meta, trialFinished: true, firstPaidAt: day(50), subscribed: true, currentlyActive: true, revenueCents: 9800, revenue30dCents: 4900, cost30dMicros: 2_000_000 }),
        signup({ touch: meta, trialFinished: true }),
      ],
      "channel",
      now,
    );
    expect(rows[0]).toMatchObject({ key: "meta_paid", landed: 4, signedUp: 2, trialFinished: 2, paid: 1, active30d: 1, eligible30d: 1, activeNow: 1, revenueCents: 9800, grossProfit30dCents: 4700 });
    expect(rows[0]?.rates).toEqual({ signup: 0.5, trial: 1, paid: 0.5, active30d: 1 });
    expect(rows[1]).toMatchObject({ key: "direct", landed: 1, signedUp: 0, rates: { signup: 0, trial: null } });
    expect(funnelTotal(rows)).toMatchObject({ landed: 5, signedUp: 2, paid: 1 });
  });
  it("30-day activity: not eligible yet, canceled before day 30", () => {
    expect(activeAt30d(signup({ firstPaidAt: day(10), subscribed: true }), now)).toEqual({ eligible: false, active: false });
    expect(activeAt30d(signup({ firstPaidAt: day(40), subscribed: true, canceledAt: day(20) }), now)).toEqual({ eligible: true, active: false });
    expect(activeAt30d(signup({ firstPaidAt: day(40), subscribed: false }), now)).toEqual({ eligible: false, active: false });
  });
});

describe("cohorts", () => {
  it("groups by Monday-start UTC week, oldest first", () => {
    expect(weekStart(new Date("2026-11-08T23:00:00Z"))).toBe("2026-11-02");
    const c = cohortsByWeek([signup({ signedUpAt: new Date("2026-11-04T00:00:00Z") }), signup({ signedUpAt: new Date("2026-10-27T00:00:00Z") })], now);
    expect(c.map((r) => [r.key, r.signedUp])).toEqual([["2026-10-26", 1], ["2026-11-02", 1]]);
  });
});

describe("campaignEconomics", () => {
  it("joins spend by campaign name or id and computes unit costs", () => {
    const out = campaignEconomics(
      [{ campaignId: "123", campaignName: "C1", spendCents: 10000, clicks: 200, impressions: 9000 }, { campaignId: "9", campaignName: "idle", spendCents: 0, clicks: 0, impressions: 0 }],
      [
        signup({ touch: meta, trialFinished: true, firstPaidAt: day(50), revenue30dCents: 4900, cost30dMicros: 900_000 }),
        signup({ touch: { ...meta, utm_campaign: "123" }, trialFinished: true }),
        signup({ touch: { utm_source: "google" } }),
      ],
      now,
    );
    expect(out[0]).toMatchObject({ campaignId: "123", signedUp: 2, trialFinished: 2, paid: 1, cpcCents: 50, costPerSignupCents: 5000, costPerTrialCents: 5000, cacCents: 10000, grossProfit30dCents: 4810, gp30ToCac: 0.481 });
    expect(out[1]).toMatchObject({ campaignId: "9", signedUp: 0, cacCents: null, gp30ToCac: null });
  });
  it("works with no spend and no sign-ups", () => {
    expect(campaignEconomics([], [], now)).toEqual([]);
    expect(campaignEconomics([], [signup({ touch: meta })], now)[0]).toMatchObject({ campaignId: "c1", spendCents: 0, signedUp: 1, costPerSignupCents: 0 });
  });
});

describe("adEconomics", () => {
  it("joins sign-ups to ads by utm_content", async () => {
    const { adEconomics } = await import("@/lib/ads/funnel");
    const ad = { adId: "9", adName: "A", spendCents: 1000, impressions: 100, linkClicks: 5, ctr: 5 };
    const t = { utm_source: "facebook", utm_campaign: "1", utm_content: "9" };
    const rows = adEconomics([ad], [signup({ touch: t, trialFinished: true }), signup({ touch: { ...t, utm_content: "8" } }), signup({ touch: { ...t, utm_campaign: "2", utm_content: "7" } })], "1");
    expect(rows.map((r) => [r.adId, r.signedUp, r.costPerSignupCents])).toEqual([["9", 1, 1000], ["8", 1, 0]]);
  });
});

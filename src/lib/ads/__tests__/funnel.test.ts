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

describe("legacyBurstBots (pre-ipNet Meta ad-review bursts)", () => {
  it("drops legacy landings in a burst hour, keeps sparse legacy and all ipNet rows", async () => {
    const { legacyBurstBots, LEGACY_BURST_PER_HOUR } = await import("@/lib/ads/funnel");
    const at = (iso: string) => new Date(iso);
    const burst = Array.from({ length: 500 }, (_, i) => ({ props: { anonId: `b${i}`, firstTouch: { fbclid: `f${i}` } }, createdAt: at(`2026-11-08T18:${String(i % 60).padStart(2, "0")}:00Z`) }));
    const sparse = [{ props: { anonId: "h1" }, createdAt: at("2026-11-08T16:10:00Z") }];
    const modern = Array.from({ length: LEGACY_BURST_PER_HOUR + 5 }, (_, i) => ({ props: { anonId: `m${i}`, ipNet: "1.2.3.0/24" }, createdAt: at("2026-11-16T14:00:00Z") }));
    const rows = [...burst, ...sparse, ...modern];
    const bots = legacyBurstBots(rows);
    expect(bots.size).toBe(500);
    expect(rows.filter((_, i) => !bots.has(i)).length).toBe(1 + modern.length);
  });
});

describe("classifyTouch: growth systems + Kly", () => {
  it("gives every registry system and Kly cold email its own channel", () => {
    expect(classifyTouch({ utm_source: "recovery" }).channel).toBe("sys_checkout_recovery");
    expect(classifyTouch({ utm_source: "free_tool", utm_medium: "acquire" }).channel).toBe("sys_free_tools");
    expect(classifyTouch({ utm_source: "outbound", utm_medium: "email" }).channel).toBe("kly_email");
    expect(classifyTouch({ utm_source: "facebook" }).channel).toBe("meta_paid");
  });
});

describe("realVisits (visitor count: one real visitor per ad click per day)", () => {
  const at = (iso: string) => new Date(iso);
  const row = (props: Record<string, unknown>, iso = "2026-11-16T12:00:00Z") => ({ props: { ipNet: "1.2.3.0/24", ...props } as Record<string, unknown>, createdAt: at(iso) });
  it("dedupes one fbclid opened in several browsers the same day, keeps it on another day", async () => {
    const { realVisits } = await import("@/lib/ads/funnel");
    const rows = [
      row({ anonId: "a1", firstTouch: { fbclid: "F1" } }),
      row({ anonId: "a2", firstTouch: { fbclid: "F1" } }, "2026-11-16T12:05:00Z"),
      row({ anonId: "a3", lastTouch: { fbclid: "F1" } }, "2026-11-16T18:00:00Z"),
      row({ anonId: "a4", firstTouch: { fbclid: "F1" } }, "2026-11-17T09:00:00Z"),
      row({ anonId: "a5" }),
      row({ anonId: "a5" }, "2026-11-16T13:00:00Z"),
    ];
    const r = realVisits(rows, new Set());
    expect(r.visits.map((v) => v.props.anonId)).toEqual(["a1", "a4", "a5"]);
    expect(r.dropped).toBe(3);
  });
  it("drops bots, internal browsers, their networks and e2e test clicks", async () => {
    const { realVisits } = await import("@/lib/ads/funnel");
    const rows = [
      row({ anonId: "bot", bot: "meta_review", ipNet: "31.13.0.0/24" }),
      row({ anonId: "me", ipNet: "68.48.10.0/24" }),
      row({ anonId: "my-phone", ipNet: "68.48.10.0/24" }),
      row({ anonId: "e2e", ipNet: "9.9.9.0/24", firstTouch: { fbclid: "E2EADRDY123" } }),
      row({ anonId: "real", ipNet: "5.5.5.0/24", firstTouch: { fbclid: "IwAR1" } }),
    ];
    const r = realVisits(rows, new Set(["me"]));
    expect(r.visits.map((v) => v.props.anonId)).toEqual(["real"]);
    expect(r.bots).toBe(1);
  });
  it("still drops legacy (no ipNet) bursts", async () => {
    const { realVisits, LEGACY_BURST_PER_HOUR } = await import("@/lib/ads/funnel");
    const burst = Array.from({ length: LEGACY_BURST_PER_HOUR }, (_, i) => ({ props: { anonId: `b${i}`, firstTouch: { fbclid: `x${i}` } }, createdAt: at("2026-11-08T10:00:00Z") }));
    expect(realVisits([...burst, { props: { anonId: "ok" }, createdAt: at("2026-11-08T15:00:00Z") }], new Set()).visits).toHaveLength(1);
  });
});

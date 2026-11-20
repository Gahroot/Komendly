import { describe, expect, it } from "vitest";
import { buildScoreboard, channelsProducing, checkpointRows, isCommunityTouch, lastWeeks, newPayments, scoreChannel, type ScoreSignup } from "@/lib/ads/scoreboard";

const d = (iso: string) => new Date(iso);

describe("scoreChannel", () => {
  it("maps first touch and DB links to scoreboard channels", () => {
    expect(scoreChannel({ touch: { fbclid: "x" } })).toBe("meta");
    expect(scoreChannel({ touch: { utm_source: "facebook", utm_campaign: "123" } })).toBe("meta");
    expect(scoreChannel({ touch: { utm_source: "outbound" } })).toBe("kly");
    expect(scoreChannel({ touch: null, klyLead: true })).toBe("kly");
    expect(scoreChannel({ touch: { fbclid: "x" }, referral: true })).toBe("referral");
    expect(scoreChannel({ touch: { utm_source: "referral", utm_campaign: "abc" } })).toBe("referral");
    expect(scoreChannel({ touch: { utm_source: "partner" } })).toBe("referral");
    expect(scoreChannel({ touch: { utm_source: "reddit", utm_medium: "offsite-authority" } })).toBe("community");
    expect(scoreChannel({ touch: { utm_source: "Quora" } })).toBe("community");
    expect(scoreChannel({ touch: { referrer: "old.reddit.com" } })).toBe("community");
    expect(scoreChannel({ touch: { utm_source: "blog", utm_campaign: "best-ad-tools" } })).toBe("blog");
    expect(scoreChannel({ touch: { utm_source: "newsletter" } })).toBe("other");
    expect(scoreChannel({ touch: { referrer: "google.com" } })).toBe("other");
    expect(scoreChannel({ touch: null })).toBe("direct");
    expect(isCommunityTouch({ utm_source: "linkedin" })).toBe(false);
  });
});

describe("newPayments", () => {
  it("counts checkouts, plus paid_converted only without a subscription checkout", () => {
    const p = newPayments([
      { workspaceId: "w1", name: "purchased", props: { mode: "subscription", key: "launch_month", amountCents: 9700 }, createdAt: d("2026-11-18T10:00:00Z") },
      { workspaceId: "w1", name: "paid_converted", props: { plan: "starter", amountCents: 9700 }, createdAt: d("2026-11-18T10:00:01Z") },
      { workspaceId: "w2", name: "paid_converted", props: { plan: "starter", amountCents: 19700 }, createdAt: d("2026-11-10T10:00:00Z") },
      { workspaceId: "w3", name: "purchased", props: { mode: "payment", key: "unlock_pack", amountCents: 900 }, createdAt: d("2026-11-12T10:00:00Z") },
    ]);
    expect(p.map((x) => [x.workspaceId, x.amountCents, x.what])).toEqual([["w2", 19700, "starter"], ["w3", 900, "unlock_pack"], ["w1", 9700, "launch_month"]]);
  });
});

describe("buildScoreboard", () => {
  it("buckets sign-ups and payments per channel per Monday week; payment channel = sign-up channel", () => {
    const weeks = lastWeeks(2, d("2026-11-20T12:00:00Z"));
    expect(weeks).toEqual(["2026-11-09", "2026-11-16"]);
    const signups: ScoreSignup[] = [
      { workspaceId: "w1", at: d("2026-11-10T00:00:00Z"), channel: "meta" },
      { workspaceId: "w2", at: d("2026-11-17T00:00:00Z"), channel: "kly" },
      { workspaceId: "w3", at: d("2026-11-18T00:00:00Z"), channel: "meta" },
      { workspaceId: "old", at: d("2026-10-01T00:00:00Z"), channel: "blog" },
    ];
    const b = buildScoreboard(signups, [
      { workspaceId: "w2", at: d("2026-11-19T00:00:00Z"), amountCents: 9700, what: "launch" },
      { workspaceId: "w2", at: d("2026-11-19T01:00:00Z"), amountCents: 900, what: "unlock" },
      { workspaceId: "ghost", at: d("2026-11-11T00:00:00Z"), amountCents: 500, what: "x" },
    ], weeks);
    expect(b.weeks[0]).toMatchObject({ week: "2026-11-09", signupTotal: 1, paymentTotal: 1, revenueCents: 500 });
    expect(b.weeks[0].signups.meta).toBe(1);
    expect(b.weeks[0].payments.direct).toBe(1);
    expect(b.weeks[1]).toMatchObject({ signupTotal: 2, paymentTotal: 2, revenueCents: 10600 });
    expect(b.weeks[1].signups).toMatchObject({ meta: 1, kly: 1 });
    expect(b.totals.signups).toMatchObject({ meta: 2, kly: 1, blog: 1 });
    expect(b.totals.payers).toMatchObject({ kly: 1, direct: 1 });
    expect(b.totals.payments.kly).toBe(2);
    expect(channelsProducing(signups, d("2026-11-13T00:00:00Z"))).toBe(2);
  });
});

describe("checkpointRows", () => {
  it("shows live values against the 15 Dec / 31 Jan targets", () => {
    const rows = checkpointRows({ freePackWorkspaces: 40, freePackPaid: 2, verifiedLeadsAvailable: 507, emailsPerDay: 22.857, signupsLast7d: 55, channelsLast7d: 3, payingCustomers: 2, customersWithAdsLive: null });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.free_to_paid).toMatchObject({ live: "2 of 40 (5.0%)", met: { dec15: true, jan31: true } });
    expect(by.verified_leads).toMatchObject({ live: "507", met: { dec15: false, jan31: false } });
    expect(by.emails_per_day.live).toBe("22.9");
    expect(by.signups_week.met).toEqual({ dec15: true, jan31: false });
    expect(by.channels.met).toEqual({ dec15: true, jan31: false });
    expect(by.ads_live).toMatchObject({ live: "no data", met: null });
    expect(rows).toHaveLength(7);
  });
});

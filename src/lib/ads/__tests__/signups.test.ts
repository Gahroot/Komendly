import { describe, expect, it } from "vitest";
import { buildSignupRow, filterSignupRows, parseSignupFilter, type SignupInput } from "@/lib/ads/signups";

const t = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
const base = (over: Partial<SignupInput> = {}): SignupInput => ({
  userId: "u", email: "a@x.com", emailVerifiedAt: null, workspaceId: "w", workspaceName: "W", signedUpAt: t(0), touch: null,
  events: [], runs: [], adsReady: 0, adsTotal: 0, workspace: { adsPlan: "trial", subscriptionStatus: "none", stripeSubscriptionId: null, canceledAt: null }, ...over,
});
const run = { url: "https://a.com", isTrial: true, status: "completed", createdAt: t(2), firstAdAt: t(3), completedAt: t(4) };

describe("buildSignupRow stages", () => {
  it("walks not verified -> verified -> trial -> checkout", () => {
    expect(buildSignupRow(base()).stage).toBe("not_verified");
    expect(buildSignupRow(base({ emailVerifiedAt: t(1) })).stage).toBe("verified_no_trial");
    expect(buildSignupRow(base({ runs: [{ ...run, status: "generating", completedAt: null }] })).stage).toBe("trial_running");
    expect(buildSignupRow(base({ runs: [run] })).stage).toBe("trial_done");
    expect(buildSignupRow(base({ runs: [run], events: [{ name: "checkout_started", createdAt: t(5), props: {} }] })).stage).toBe("checkout_started");
  });

  it("paid uses purchased+renewed revenue (paid_converted ignored when purchased exists), churned when canceled", () => {
    const events = [
      { name: "renewed", createdAt: t(9), props: { amountCents: 4900 } },
      { name: "purchased", createdAt: t(6), props: { amountCents: 4900 } },
      { name: "paid_converted", createdAt: t(6), props: { amountCents: 4900 } },
      { name: "export_downloaded", createdAt: t(5), props: {} },
      { name: "export_downloaded", createdAt: t(5), props: {} },
      { name: "upsell_shown", createdAt: t(4), props: {} },
    ];
    const ws = { adsPlan: "starter", subscriptionStatus: "active", stripeSubscriptionId: "sub", canceledAt: null };
    const r = buildSignupRow(base({ events, runs: [run, { ...run, url: "https://b.com", isTrial: false, createdAt: t(7) }], workspace: ws, adsReady: 8, adsTotal: 10 }));
    expect(r).toMatchObject({ stage: "paid", paidAt: t(6), paidCents: 9800, downloads: 2, upsellShownAt: t(4), websites: ["https://a.com", "https://b.com"], trialStartedAt: t(2), firstAdReadyAt: t(3), runCompletedAt: t(4), plan: "starter" });
    expect(buildSignupRow(base({ events, workspace: { ...ws, subscriptionStatus: "canceled", canceledAt: t(20) } })).stage).toBe("churned");
  });

  it("reads Meta attribution", () => {
    const r = buildSignupRow(base({ touch: { utm_source: "facebook", utm_campaign: "123", utm_content: "456", utm_term: "789" } }));
    expect(r).toMatchObject({ isMeta: true, utmCampaign: "123", utmContent: "456", utmTerm: "789" });
  });
});

describe("filterSignupRows", () => {
  it("hides e2e users by default, filters by source/stage, newest first", () => {
    const rows = [
      buildSignupRow(base({ workspaceId: "a", signedUpAt: t(1), touch: { utm_source: "facebook" } })),
      buildSignupRow(base({ workspaceId: "b", signedUpAt: t(3), email: "e2e-adrdy+17@komendly.com" })),
      buildSignupRow(base({ workspaceId: "c", signedUpAt: t(2), emailVerifiedAt: t(2) })),
    ];
    expect(filterSignupRows(rows, parseSignupFilter({})).map((r) => r.workspaceId)).toEqual(["c", "a"]);
    expect(filterSignupRows(rows, parseSignupFilter({ test: "1" })).map((r) => r.workspaceId)).toEqual(["b", "c", "a"]);
    expect(filterSignupRows(rows, parseSignupFilter({ source: "facebook" })).map((r) => r.workspaceId)).toEqual(["a"]);
    expect(filterSignupRows(rows, parseSignupFilter({ source: "other", stage: "verified_no_trial" })).map((r) => r.workspaceId)).toEqual(["c"]);
    expect(parseSignupFilter({ stage: "bogus" }).stage).toBe("all");
  });
});

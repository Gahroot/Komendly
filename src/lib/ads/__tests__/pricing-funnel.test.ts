import { describe, expect, it } from "vitest";
import { personOf, pricingDropoff, pricingPageOf, type FunnelEvent, type PricingFunnelInput } from "@/lib/ads/pricing-funnel";

const t = (m: number) => new Date(Date.UTC(2026, 10, 10, 12, m));
const ev = (name: string, over: Partial<FunnelEvent> = {}): FunnelEvent => ({ name, userId: null, workspaceId: null, props: {}, createdAt: t(0), ...over });
const base = (events: FunnelEvent[], over: Partial<PricingFunnelInput> = {}): PricingFunnelInput => ({
  events, ownerOf: new Map([["w1", "u1"], ["wX", "uX"]]), freePackUsers: new Set(["u1"]), internal: { userIds: ["uX"], workspaceIds: [], anonIds: ["aX"] }, ...over,
});

describe("pricingPageOf", () => {
  it("accepts known pricing paths only", () => {
    expect(pricingPageOf("/pricing?billing=year")).toBe("/pricing");
    expect(pricingPageOf("/ads/billing/")).toBe("/ads/billing");
    expect(pricingPageOf("/ads")).toBeNull();
    expect(pricingPageOf(3)).toBeNull();
  });
});

describe("personOf", () => {
  it("prefers user, then workspace owner, then anonId", () => {
    const owners = new Map([["w1", "u1"]]);
    expect(personOf(ev("x", { userId: "u2", workspaceId: "w1" }), owners)).toBe("u:u2");
    expect(personOf(ev("x", { workspaceId: "w1" }), owners)).toBe("u:u1");
    expect(personOf(ev("x", { props: { anonId: "a1" } }), owners)).toBe("a:a1");
    expect(personOf(ev("x"), owners)).toBeNull();
  });
});

describe("pricingDropoff", () => {
  const events = [
    ev("pricing_viewed", { props: { anonId: "a1", page: "/pricing", signedIn: false }, createdAt: t(1) }),
    ev("pricing_viewed", { props: { anonId: "a1", page: "/pricing", signedIn: false }, createdAt: t(2) }),
    ev("pricing_plan_clicked", { props: { anonId: "a1", clickedPlan: "growth", interval: "month" }, createdAt: t(3) }),
    ev("pricing_viewed", { userId: "u1", props: { anonId: "b", page: "/ads/billing", signedIn: true }, createdAt: t(4) }),
    ev("offer_modal_shown", { workspaceId: "w1", createdAt: t(5) }),
    ev("pricing_plan_clicked", { userId: "u1", props: { clickedPlan: "scale", interval: "year" }, createdAt: t(6) }),
    ev("checkout_started", { workspaceId: "w1", createdAt: t(7) }),
    ev("pricing_viewed", { props: { anonId: "bot", bot: "meta_review" }, createdAt: t(8) }),
    ev("pricing_viewed", { userId: "uX", props: { signedIn: true }, createdAt: t(9) }),
    ev("pricing_viewed", { props: { anonId: "aX" }, createdAt: t(9) }),
    ev("offer_nudge_shown", { workspaceId: "wX", createdAt: t(9) }),
  ];

  it("counts unique real people per step with step-to-step rates", () => {
    const d = pricingDropoff(base(events));
    expect(d.steps.map((s) => [s.key, s.count])).toEqual([["viewed", 2], ["offer", 1], ["clicked", 2], ["checkout", 1], ["paid", 0]]);
    expect(d.steps[0]?.fromPrev).toBeNull();
    expect(d.steps[1]?.fromPrev).toBe(0.5);
    expect(d.steps[2]?.fromPrev).toBe(2);
    expect(d.steps[4]?.fromPrev).toBe(0);
    expect(d.viewedSignedIn).toBe(1);
    expect(d.viewedSignedOut).toBe(1);
    expect(d.botViews).toBe(1);
  });

  it("lists latest viewers first with clicks, free pack and checkout", () => {
    const d = pricingDropoff(base([...events].reverse()));
    expect(d.recent).toEqual([
      { person: "u:u1", lastViewAt: t(4), page: "/ads/billing", signedIn: true, hadFreePack: true, clicked: ["scale/year"], checkedOut: true, paid: false },
      { person: "a:a1", lastViewAt: t(2), page: "/pricing", signedIn: false, hadFreePack: false, clicked: ["growth/month"], checkedOut: false, paid: false },
    ]);
    expect(pricingDropoff(base(events), 1).recent).toHaveLength(1);
  });

  it("returns null rates on empty data", () => {
    const d = pricingDropoff(base([]));
    expect(d.steps.every((s) => s.count === 0)).toBe(true);
    expect(d.steps[1]?.fromPrev).toBeNull();
  });
});

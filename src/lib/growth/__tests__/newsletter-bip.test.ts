import { describe, expect, it } from "vitest";
import { NEWSLETTER_EVENTS, activeNewsletterSubs, buildIssue, buildIssueEmail, checkIssue, parseNewsletterInput, type ReportSlice } from "../newsletter";
import { buildDrafts, checkDraft, deltaSince, type BipSnapshot } from "../build-in-public";

const report: ReportSlice = { collectedOn: "2026-11-20", advertisers: 1529, indexable: true, liveAds: { multiAdShare: 0.41 }, runDays: { median: 63, over90Share: 0.3 }, byTrade: [] };
const ev = (id: string, name: string, props: Record<string, unknown>, t: string) => ({ id, name, createdAt: new Date(t), props });

describe("newsletter", () => {
  it("builds a checked issue with dated source and utm links", () => {
    const i = buildIssue(new Date("2026-11-26T14:00:00Z"), report);
    expect(checkIssue(i)).toBeNull();
    expect(i.stat.text).toContain("63 days");
    expect(buildIssueEmail({ issue: i, unsubscribeUrl: "https://x/u" }).text).toContain("Unsubscribe: https://x/u");
  });
  it("rejects promised results and untracked links", () => {
    const i = buildIssue(new Date("2026-11-26T14:00:00Z"), report);
    expect(checkIssue({ ...i, tip: { ...i.tip, text: "We guarantee 3x leads" } })).toBe("promises results");
    expect(checkIssue({ ...i, cta: { ...i.cta, href: "https://www.komendly.com/free-ads" } })).toMatch(/utm_source=ozzy_report/);
  });
  it("only confirmed, not-unsubscribed, not-yet-sent subscribers are active", () => {
    const events = [
      ev("s1", NEWSLETTER_EVENTS.subscribed, { email: "a@x.com" }, "2026-11-01"), ev("c1", NEWSLETTER_EVENTS.confirmed, { subId: "s1", email: "a@x.com" }, "2026-11-01T01:00"),
      ev("s2", NEWSLETTER_EVENTS.subscribed, { email: "b@x.com" }, "2026-11-01"),
      ev("s3", NEWSLETTER_EVENTS.subscribed, { email: "c@x.com" }, "2026-11-01"), ev("c3", NEWSLETTER_EVENTS.confirmed, { subId: "s3", email: "c@x.com" }, "2026-11-01T01:00"), ev("u3", NEWSLETTER_EVENTS.unsubscribed, { email: "c@x.com" }, "2026-11-05"),
      ev("n1", NEWSLETTER_EVENTS.sent, { subId: "s1", email: "a@x.com", issue: "2026-W48" }, "2026-11-26"),
    ];
    const subs = activeNewsletterSubs(events);
    expect(subs.map((s) => s.email)).toEqual(["a@x.com"]);
    expect(subs[0]!.issuesDone.has("2026-W48")).toBe(true);
  });
  it("validates email", () => {
    expect(parseNewsletterInput({ email: " A@B.com " })).toEqual({ ok: true, email: "a@b.com" });
    expect(parseNewsletterInput({ email: "nope" }).ok).toBe(false);
  });
});

describe("build in public", () => {
  const snap: BipSnapshot = { date: "2026-11-27", signupsTotal: 73, signups7d: 12, payingCustomers: 0, coldEmailsSent: 1200, socialPostsPosted: 20, systemsOn: 30, systemsTotal: 60, topSources: [{ source: "facebook", signups: 60 }] };
  it("states zero paying customers plainly and passes checks", () => {
    const d = buildDrafts(snap, null);
    expect(d.find((x) => x.platform === "long")!.text).toContain("Paying customers: 0");
    for (const x of d) expect(checkDraft(x, snap)).toBeNull();
  });
  it("computes deltas and blocks money claims", () => {
    expect(deltaSince(snap, { ...snap, signupsTotal: 60 })!.signups).toBe(13);
    expect(checkDraft({ platform: "long", text: "Ozzy says we made $5k revenue", link: "https://www.komendly.com/?utm_source=build_in_public" }, snap)).toBe("money claim with no paying customers");
  });
});

import { buildAwardDraft, checkAward, pickAdOfTheMonth, type FeatureRow } from "../recognition";
describe("recognition", () => {
  const row = (o: Partial<FeatureRow>): FeatureRow => ({ id: "f", adId: "a", brandName: "Acme Roofing", handle: "@acme", status: "consented", consentAt: "2026-11-05T00:00:00Z", featuredAt: null, ...o });
  it("only consented ads in the month qualify, featured first", () => {
    expect(pickAdOfTheMonth([row({ status: "declined" }), row({ adId: "w", status: "withdrawn" })], "2026-11")).toBeNull();
    expect(pickAdOfTheMonth([row({ adId: "c" }), row({ adId: "f", status: "featured", featuredAt: "2026-11-10T00:00:00Z" })], "2026-11")!.adId).toBe("f");
    expect(pickAdOfTheMonth([row({})], "2026-10")).toBeNull();
    expect(pickAdOfTheMonth([row({})], "2026-11", new Set(["a"]))).toBeNull();
  });
  it("draft names no result and carries utm", () => {
    const f = row({});
    const d = buildAwardDraft(f, "2026-11");
    expect(checkAward(d, f)).toBeNull();
    expect(d.caption).toContain("@acme");
  });
});

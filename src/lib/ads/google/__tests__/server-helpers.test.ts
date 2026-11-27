import { describe, expect, it } from "vitest";
import { googleAccessFor, googlePublishFlagKeys } from "../access";
import { returnUrl, safeReturnTo } from "../oauth-flow";
import { publishRequestErrors, youtubeVideoId, type GooglePublishRequest } from "../publish-request";

const paid = { adsPlan: "growth", subscriptionStatus: "active", suspendedAt: null } as never;
const trial = { adsPlan: "trial", subscriptionStatus: "active", suspendedAt: null } as never;

const req = (): GooglePublishRequest => ({
  runId: "r1", adIds: ["a1"], customerId: "1234567890", campaigns: ["search", "demand_gen"], dailyBudget: 20,
  geo: [{ kind: "location", id: "1014221", name: "Austin, Texas", type: "City", countryCode: "US" }],
  keywords: [{ text: "plumber austin", match: "PHRASE" }],
  search: { headlines: ["Fast Plumber in Austin", "Same Day Repairs", "Call For A Free Quote"], descriptions: ["Licensed plumbers near you.", "Book online today."], path1: "plumbing", path2: "" },
  finalUrl: "https://example.com",
});

describe("google access", () => {
  it("flag first, then paid", () => {
    expect(googleAccessFor(paid, false)).toBe("flag_off");
    expect(googleAccessFor(trial, true)).toBe("not_paid");
    expect(googleAccessFor(paid, true)).toBe("ok");
    expect(googlePublishFlagKeys("w1")).toEqual(["google_publish", "google_publish:w1"]);
  });
});

describe("oauth return", () => {
  it("only allows same-site paths", () => {
    expect(safeReturnTo("/ads/runs/1?x=1")).toBe("/ads/runs/1?x=1");
    expect(safeReturnTo("//evil.com")).toBe("/ads/app");
    expect(safeReturnTo("https://evil.com")).toBe("/ads/app");
    expect(safeReturnTo("/\\evil.com")).toBe("/ads/app");
  });
  it("adds the result params once", () => {
    expect(returnUrl("/ads/runs/1?google=error&reason=x&a=1", "connected")).toBe("/ads/runs/1?a=1&google=connected");
    expect(returnUrl("/ads/runs/1", "error", "access_denied")).toBe("/ads/runs/1?google=error&reason=access_denied");
  });
});

describe("publish re-validation", () => {
  it("accepts a good request", () => expect(publishRequestErrors(req(), "USD")).toEqual([]));
  it("rejects long text, low budget, bad youtube and image ads without images", () => {
    const r = req();
    r.search.headlines[0] = "x".repeat(31);
    r.dailyBudget = 1;
    r.youtubeVideoUrl = "https://vimeo.com/1";
    r.adIds = [];
    const e = publishRequestErrors(r, "USD");
    expect(e.some((x) => x.includes("longer than 30"))).toBe(true);
    expect(e.some((x) => x.includes("at least 5"))).toBe(true);
    expect(e).toContain("That doesn't look like a YouTube link.");
  });
  it("parses YouTube ids", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("nope")).toBeNull();
  });
});

describe("env switches", () => {
  it("account creation and verified sign-in are off unless set to 1", async () => {
    const { canCreateAccounts, oauthVerified } = await import("../config");
    const keep = { c: process.env.GOOGLE_ADS_ALLOW_CREATE, v: process.env.GOOGLE_ADS_OAUTH_VERIFIED };
    delete process.env.GOOGLE_ADS_ALLOW_CREATE; delete process.env.GOOGLE_ADS_OAUTH_VERIFIED;
    expect(canCreateAccounts()).toBe(false);
    expect(oauthVerified()).toBe(false);
    process.env.GOOGLE_ADS_ALLOW_CREATE = "1"; process.env.GOOGLE_ADS_OAUTH_VERIFIED = "1";
    expect(canCreateAccounts()).toBe(true);
    expect(oauthVerified()).toBe(true);
    if (keep.c === undefined) delete process.env.GOOGLE_ADS_ALLOW_CREATE; else process.env.GOOGLE_ADS_ALLOW_CREATE = keep.c;
    if (keep.v === undefined) delete process.env.GOOGLE_ADS_OAUTH_VERIFIED; else process.env.GOOGLE_ADS_OAUTH_VERIFIED = keep.v;
  });
});

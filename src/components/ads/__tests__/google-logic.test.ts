import { describe, expect, it } from "vitest";
import type { GoogleReadiness } from "@/lib/ads/google/client-api";
import {
  adTextLength, addKeyword, blockerText, campaignsFor, cleanKeyword, connectErrorText, displayUrl, formatCustomerId, monthlyEstimate,
  normalizeCustomerId, parseMoney, policyIssueText, previewsByAd, publishBlockers, readReturnParams, visibleSteps, youtubeId, type PublishForm,
} from "../google-steps/logic";

const okForm = (): PublishForm => ({
  customerId: "1234567890",
  adIds: ["a1"],
  geo: [{ kind: "location", id: "1014221", name: "Austin, Texas", type: "City", countryCode: "US" }],
  dailyBudget: 20,
  minBudget: 5,
  currency: "USD",
  search: { headlines: ["Fast Plumber in Austin", "Same Day Repairs", "Call For A Free Quote"], descriptions: ["Licensed plumbers near you.", "Book online today."], path1: "plumbing", path2: "repairs" },
  keywords: [{ text: "plumber near me", match: "PHRASE" }],
  finalUrl: "https://example.com",
  youtubeUrl: "",
});

describe("customer id", () => {
  it.each(["123-456-7890", "123 456 7890", " 1234567890 ", "123.456.7890", "123–456–7890"])("accepts %s", (v) => {
    expect(normalizeCustomerId(v)).toBe("1234567890");
  });
  it.each(["12345", "123-456-789", "abc-def-ghij", "12345678901", ""])("rejects %s", (v) => {
    expect(normalizeCustomerId(v)).toBeNull();
  });
  it("formats like Google Ads", () => expect(formatCustomerId("1234567890")).toBe("123-456-7890"));
});

describe("adTextLength", () => {
  it("counts plain text and accents as one each", () => {
    expect(adTextLength("café")).toBe(4);
    expect(adTextLength("e\u0301")).toBe(1);
  });
  it("counts emoji (incl. skin tones and ZWJ) as two", () => {
    expect(adTextLength("🔧")).toBe(2);
    expect(adTextLength("👍🏽")).toBe(2);
    expect(adTextLength("👨‍👩‍👧")).toBe(2);
    expect(adTextLength("Fix 🔧")).toBe(6);
  });
  it("counts double-width characters as two", () => expect(adTextLength("東京")).toBe(4));
});

describe("money", () => {
  it("monthly is daily x 30.4 x campaigns", () => {
    expect(monthlyEstimate(10)).toBe(304);
    expect(monthlyEstimate(10, 2)).toBe(608);
    expect(monthlyEstimate(12.5)).toBe(380);
    expect(monthlyEstimate(0)).toBe(0);
    expect(monthlyEstimate(NaN)).toBe(0);
  });
  it("parses typed amounts", () => {
    expect(parseMoney("12,50")).toBe(12.5);
    expect(parseMoney("20")).toBe(20);
    expect(parseMoney("abc")).toBeNaN();
  });
});

describe("publishBlockers", () => {
  it("passes a good form", () => expect(publishBlockers(okForm())).toEqual([]));
  it("blocks a headline over 30 characters", () => {
    const f = okForm();
    f.search.headlines[0] = "x".repeat(31);
    expect(publishBlockers(f)).toContain("A headline is too long (30 characters max).");
  });
  it("blocks when an emoji pushes a headline over", () => {
    const f = okForm();
    f.search.headlines[0] = "x".repeat(29) + "🔧";
    const b = publishBlockers(f);
    expect(b.some((x) => x.includes("too long"))).toBe(true);
    expect(b.some((x) => x.includes("emoji"))).toBe(true);
  });
  it("blocks too few headlines/descriptions, long descriptions and paths", () => {
    const f = okForm();
    f.search.headlines = ["One", "Two"];
    f.search.descriptions = ["y".repeat(91)];
    f.search.path1 = "p".repeat(16);
    const b = publishBlockers(f);
    expect(b).toContain("Add at least 3 headlines.");
    expect(b).toContain("Add at least 2 descriptions.");
    expect(b).toContain("A description is too long (90 characters max).");
    expect(b.some((x) => x.includes("15 characters"))).toBe(true);
  });
  it("blocks duplicates, empty fields, no keywords, no area, low budget, bad url, bad youtube link", () => {
    const f = okForm();
    f.search.headlines.push("same day repairs", "");
    f.keywords = [];
    f.geo = [];
    f.dailyBudget = 2;
    f.finalUrl = "example";
    f.youtubeUrl = "https://vimeo.com/123";
    const b = publishBlockers(f);
    expect(b).toEqual(expect.arrayContaining([
      "Two headlines are the same. Change or remove one.",
      "Fill in or remove the empty headline.",
      "Add at least one search phrase.",
      "Choose where your customers are.",
      "Enter the web page people land on, starting with https://",
      "That doesn't look like a YouTube link. Fix it or leave it empty.",
    ]));
    expect(b.some((x) => x.startsWith("The daily budget must be at least"))).toBe(true);
  });
  it("blocks ! in headlines", () => {
    const f = okForm();
    f.search.headlines[0] = "Call now!";
    expect(publishBlockers(f)).toContain('Google doesn\'t allow "!" in headlines. Remove it.');
  });
  it("blocks path2 without path1 and more than 15 headlines", () => {
    const f = okForm();
    f.search.path1 = "";
    f.search.headlines = Array.from({ length: 16 }, (_, i) => `Headline ${i}`);
    const b = publishBlockers(f);
    expect(b).toContain("Fill in the first web address word before the second.");
    expect(b).toContain("Use at most 15 headlines.");
  });
});

describe("youtube, keywords, urls", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["youtu.be/dQw4w9WgXcQ?t=3", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://vimeo.com/1", null],
  ])("youtubeId(%s)", (v, id) => expect(youtubeId(v)).toBe(id));
  it("cleans and dedupes keywords", () => {
    expect(cleanKeyword('  "Emergency  Plumber" ')).toBe("emergency plumber");
    expect(cleanKeyword("a ".repeat(11))).toBeNull();
    const k = addKeyword([], "Roof Repair");
    expect(k).toEqual([{ text: "roof repair", match: "PHRASE" }]);
    expect(addKeyword(k, "roof repair")).toBe(k);
  });
  it("display url", () => {
    expect(displayUrl("https://www.acme.com/x", "roofing", "austin")).toBe("www.acme.com/roofing/austin");
    expect(displayUrl("https://acme.com", "", "austin")).toBe("acme.com");
  });
});

describe("flow helpers", () => {
  it("campaigns: image ads only when images or a video were picked", () => {
    expect(campaignsFor([], "")).toEqual(["search"]);
    expect(campaignsFor(["a"], "")).toEqual(["search", "demand_gen"]);
    expect(campaignsFor([], "https://youtu.be/dQw4w9WgXcQ")).toEqual(["search", "demand_gen"]);
  });
  it("one preview per ad, square first", () => {
    expect(previewsByAd([
      { adId: "a", ratio: "9:16", previewUrl: "a916" }, { adId: "a", ratio: "1:1", previewUrl: "a11" }, { adId: "b", ratio: "4:5", previewUrl: "b45" },
    ])).toEqual([{ adId: "a", previewUrl: "a11" }, { adId: "b", previewUrl: "b45" }]);
  });
  it("skips the account step for manager links and single accounts", () => {
    const r: GoogleReadiness = { billing: "ok", account: "ok", managerLink: "active", canPublish: true, blockers: [] };
    expect(visibleSteps({ connection: { mode: "manager", readiness: r } }, null)).not.toContain("account");
    expect(visibleSteps({ connection: { mode: "oauth", readiness: r } }, 1)).not.toContain("account");
    expect(visibleSteps({ connection: { mode: "oauth", readiness: r } }, 3)).toContain("account");
  });
  it("reads and strips the return params", () => {
    expect(readReturnParams("https://x.com/ads/runs/1?google=error&reason=access_denied&a=1")).toEqual({ result: "error", reason: "access_denied", cleaned: "/ads/runs/1?a=1" });
    expect(readReturnParams("https://x.com/ads/runs/1").result).toBeNull();
  });
  it("plain words for codes", () => {
    expect(connectErrorText("access_denied")).toMatch(/press Allow/);
    expect(connectErrorText("weird")).toBe("Google sign-in didn't finish. Please try again.");
    expect(policyIssueText("DESTINATION_NOT_WORKING")).toMatch(/didn't open/);
    expect(policyIssueText("SOME_NEW_TOPIC")).toBe("Google flagged: some new topic. Open the ad in Google Ads to see what to change.");
    expect(policyIssueText("Your landing page is down.")).toBe("Your landing page is down.");
    expect(blockerText("billing_missing")).toBe("Add a payment card in Google Ads.");
  });
});

describe("account list", () => {
  it("keeps test accounts (Google reports them CLOSED) and drops managers", async () => {
    const { adAccounts } = await import("../google-steps/logic");
    const base = { currency: "USD", timeZone: "America/Chicago", loginCustomerId: undefined };
    const list = adAccounts([
      { ...base, customerId: "1111111111", name: "Test shop", manager: false, status: "CLOSED", test: true },
      { ...base, customerId: "2222222222", name: "My MCC", manager: true, status: "ENABLED", test: false },
    ]);
    expect(list.map((a) => a.customerId)).toEqual(["1111111111"]);
  });
});

import { describe, expect, it } from "vitest";
import { hasReadableContent, isChallengePage } from "../src/jobs/extract/crawl";

describe("bot challenge pages", () => {
  it("flags common interstitials", () => {
    expect(isChallengePage({ title: "Checking your browser...", text: "Checking your browser This will only take a few seconds..." })).toBe(true);
    expect(isChallengePage({ title: "Just a moment...", text: "Enable JavaScript and cookies to continue" })).toBe(true);
    expect(isChallengePage({ title: "Attention Required! | Cloudflare", text: "Sorry, you have been blocked" })).toBe(true);
  });
  it("keeps real pages, even ones mentioning security", () => {
    expect(isChallengePage({ title: "Ben's Plumbing LLC", text: "Water service replacement in the DC area. Call us for an estimate. ".repeat(10) })).toBe(false);
    const long = `Access denied? Our locksmiths help when you're locked out. ${"We open doors fast across Austin. ".repeat(60)}`;
    expect(isChallengePage({ title: "Austin Locksmith", text: long })).toBe(false);
  });
  it("a crawl with only a challenge page is not readable", () => {
    expect(hasReadableContent({ pages: [{ title: "Just a moment...", text: "Checking your browser before accessing the site. Please wait while we verify." } as never] })).toBe(false);
    expect(hasReadableContent({ pages: [{ title: "Home", text: "We fix leaks, replace water lines and install hose bibs across DC." } as never] })).toBe(true);
  });
});

import { imageDeadline, MIN_IMAGE_BUDGET_MS } from "../src/jobs/extract/crawl";
describe("photo download budget floor", () => {
  it("gives photos at least the floor even when the crawl deadline already passed", () => {
    expect(imageDeadline(1_000, 50_000)).toBe(50_000 + MIN_IMAGE_BUDGET_MS);
  });
  it("keeps a later crawl deadline as is", () => {
    expect(imageDeadline(90_000, 50_000)).toBe(90_000);
  });
});

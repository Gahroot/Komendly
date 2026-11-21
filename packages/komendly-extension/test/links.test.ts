import { describe, expect, it } from "vitest";
import { buildAdCheckUrl, buildRemixUrl, normalizeWebsite, pageIdFromLibraryUrl } from "../src/links";
import type { AdCardInfo } from "../src/parser";

const ad: AdCardInfo = {
  libraryId: "123456789",
  libraryUrl: "https://www.facebook.com/ads/library/?id=123456789",
  pageName: "Joe's Plumbing",
  pageUrl: "https://www.facebook.com/joesplumbing/",
  pageId: "joesplumbing",
  text: "Clogged drain? $79 drain opening.\nCall today.",
  headline: "$79 Drain Opening",
  description: null,
  cta: "Call now",
  destinationUrl: null,
  imageUrl: "https://scontent.xx.fbcdn.net/v/a.jpg?x=1&y=2",
  videoUrl: null,
  multipleVersions: false,
};

describe("buildRemixUrl", () => {
  it("carries the ad, the website and chrome_ext attribution", () => {
    const u = new URL(buildRemixUrl(ad, "joesplumbing.com"));
    expect(u.origin + u.pathname).toBe("https://www.komendly.com/remix");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      ad_url: ad.libraryUrl,
      ad_headline: "$79 Drain Opening",
      ad_text: "Clogged drain? $79 drain opening.\nCall today.",
      ad_image: "https://scontent.xx.fbcdn.net/v/a.jpg?x=1&y=2",
      ad_page: "Joe's Plumbing",
      website: "https://joesplumbing.com/",
      utm_source: "chrome_ext",
      utm_medium: "extension",
      utm_campaign: "remake_button",
    });
  });

  it("omits what's missing and caps long text", () => {
    const u = new URL(buildRemixUrl({ ...ad, headline: null, imageUrl: "http://insecure/x.jpg", text: "x".repeat(5000) }, null));
    expect(u.searchParams.has("ad_headline")).toBe(false);
    expect(u.searchParams.has("ad_image")).toBe(false);
    expect(u.searchParams.has("website")).toBe(false);
    expect(u.searchParams.get("ad_text")).toHaveLength(1000);
    expect(u.toString().length).toBeLessThan(8000);
  });
});

describe("normalizeWebsite", () => {
  it.each([
    ["joesplumbing.com", "https://joesplumbing.com/"],
    [" https://www.joes.co.uk/about ", "https://www.joes.co.uk/about"],
    ["http://joes.com", "http://joes.com/"],
  ])("%s -> %s", (raw, out) => expect(normalizeWebsite(raw)).toBe(out));
  it.each(["", "joe", "not a site", "javascript:alert(1)", "https://facebook.com/joes", "localhost:3000"])("rejects %j", (raw) => expect(normalizeWebsite(raw)).toBeNull());
});

describe("ad check + page ids", () => {
  it("links to the free Meta ad check with chrome_ext attribution", () => {
    const u = new URL(buildAdCheckUrl("61583991106859"));
    expect(u.pathname).toBe("/tools/meta-ad-check");
    expect(u.searchParams.get("page")).toBe("61583991106859");
    expect(u.searchParams.get("utm_source")).toBe("chrome_ext");
  });
  it("reads view_all_page_id from Ad Library URLs", () => {
    expect(pageIdFromLibraryUrl("https://www.facebook.com/ads/library/?active_status=all&view_all_page_id=1234567&country=US")).toBe("1234567");
    expect(pageIdFromLibraryUrl("https://www.facebook.com/ads/library/?q=plumber")).toBeNull();
    expect(pageIdFromLibraryUrl(undefined)).toBeNull();
  });
});

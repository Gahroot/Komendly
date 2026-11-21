import { describe, expect, it } from "vitest";
import { CHROME_EXTENSION_URL, freeAdsFromWebsiteHref, parseRemixPrefill, prefillWebsite } from "../chrome-extension";

describe("chrome extension /remix prefill", () => {
  it("is null for a normal /remix visit", () => {
    expect(parseRemixPrefill(new URLSearchParams(""))).toBeNull();
    expect(parseRemixPrefill(new URLSearchParams("ad=https://x.com/a&utm_source=chrome_ext"))).toBeNull();
    expect(parseRemixPrefill(new URLSearchParams("website=acme.com"))).toBeNull();
  });
  it("reads the extension's params and drops unsafe values", () => {
    const q = new URLSearchParams({
      ad_url: "https://www.facebook.com/ads/library/?id=123",
      ad_headline: "  Same-day AC repair  ",
      ad_text: "x".repeat(1200),
      ad_image: "javascript:alert(1)",
      ad_page: "Cool Air Co",
      website: "joesplumbing.com",
      utm_source: "chrome_ext",
    });
    expect(parseRemixPrefill(q)).toEqual({
      adUrl: "https://www.facebook.com/ads/library/?id=123",
      headline: "Same-day AC repair",
      text: "x".repeat(1000),
      image: null,
      page: "Cool Air Co",
      website: "https://joesplumbing.com/",
    });
  });
  it("only accepts real business websites", () => {
    expect(prefillWebsite("https://facebook.com/joe")).toBeNull();
    expect(prefillWebsite("not a site")).toBeNull();
    expect(prefillWebsite("localhost")).toBeNull();
    expect(prefillWebsite("http://acme.co/x")).toBe("http://acme.co/x");
  });
  it("free-ads link keeps chrome_ext attribution", () => {
    expect(freeAdsFromWebsiteHref("https://acme.com/")).toBe("/free-ads?url=https%3A%2F%2Facme.com%2F&utm_source=chrome_ext&utm_medium=extension&utm_campaign=remix_website");
  });
  it("store URL is a Chrome Web Store link or empty", () => {
    expect(CHROME_EXTENSION_URL === "" || CHROME_EXTENSION_URL.startsWith("https://chromewebstore.google.com/")).toBe(true);
  });
});

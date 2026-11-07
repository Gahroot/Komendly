import { describe, expect, it } from "vitest";
import { htmlToPage, rankKeyLinks } from "../src/jobs/extract/crawl";
import { attemptCap } from "../src/jobs/replace";

describe("fetch fallback HTML parse", () => {
  it("extracts title, meta, og, text and links without scripts", () => {
    const html = `<html><head><title>Acme &amp; Co</title><meta name="description" content="Fast invoices">
      <meta property="og:image" content="/og.png"><link rel="icon" href="/fav.png"><script>evil()</script></head>
      <body><nav><a href="/pricing">Pricing</a></nav><h1>Stop chasing invoices</h1><p>It&#39;s 11pm.</p></body></html>`;
    const r = htmlToPage(html, "https://acme.com/");
    expect(r.page.title).toBe("Acme & Co");
    expect(r.page.description).toBe("Fast invoices");
    expect(r.page.og["og:image"]).toBe("/og.png");
    expect(r.page.text).toContain("Stop chasing invoices");
    expect(r.page.text).toContain("It's 11pm.");
    expect(r.page.text).not.toContain("evil");
    expect(r.icons).toEqual(["https://acme.com/fav.png"]);
    expect(rankKeyLinks("https://acme.com/", r.links, 3)).toEqual(["https://acme.com/pricing"]);
  });
});

describe("replacement cap", () => {
  it("allows staticCount+3 statics and one motion retry", () => {
    expect(attemptCap("static", { staticCount: 10, motionCount: 1 })).toBe(13);
    expect(attemptCap("static", { staticCount: 10, motionCount: 1, isTrial: true })).toBe(15);
    expect(attemptCap("motion", { staticCount: 10, motionCount: 1 })).toBe(2);
  });
});

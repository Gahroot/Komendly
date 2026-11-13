import { describe, expect, it } from "vitest";
import { candidatePages, decodeCfEmail, deobfuscate, extractEmails } from "../src/emails";
import { findOwnSiteEmail, listedEmail } from "../src/finder";

// "info@acme.com" XOR 0x42
const cf = "42" + Array.from(Buffer.from("info@acme.com"), (b) => (b ^ 0x42).toString(16).padStart(2, "0")).join("");

describe("email parsers", () => {
  it("decodes Cloudflare email protection", () => {
    expect(decodeCfEmail(cf)).toBe("info@acme.com");
    expect(decodeCfEmail("zz")).toBeNull();
    expect(extractEmails(`<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${cf}">[email&#160;protected]</a>`, "acme.com")).toEqual(["info@acme.com"]);
    expect(extractEmails(`<a href="/cdn-cgi/l/email-protection#${cf}">mail</a>`, "acme.com")).toEqual(["info@acme.com"]);
  });
  it("decodes [at]/(dot), entities and URL encoding without false matches", () => {
    expect(deobfuscate("bob [at] acme [dot] com")).toContain("bob@acme.com");
    expect(deobfuscate("bob(at)acme.com")).toContain("bob@acme.com");
    expect(deobfuscate("bob AT acme DOT com")).toContain("bob@acme.com");
    expect(deobfuscate("call us at acme.com today")).not.toContain("@");
    expect(extractEmails("&#105;&#110;&#102;&#111;&#64;acme&#46;com", "acme.com")).toEqual(["info@acme.com"]);
    expect(extractEmails('<a href="mailto:office%40acme.com">', "acme.com")).toEqual(["office@acme.com"]);
  });
  it("reads JSON-LD, vCard and meta tags", () => {
    expect(extractEmails('<script type="application/ld+json">{"@type":"LocalBusiness","email":"mailto:hello@acme.com"}</script>', "acme.com")).toEqual(["hello@acme.com"]);
    expect(extractEmails("BEGIN:VCARD\nEMAIL;TYPE=WORK:jane@acme.com\nEND:VCARD", "acme.com")).toEqual(["jane@acme.com"]);
    expect(extractEmails('<meta name="contact:email" content="sales@acme.com">', "acme.com")).toEqual(["sales@acme.com"]);
  });
  it("drops images, platform and third-party addresses; role first", () => {
    const html = '<img src="logo@2x.png"><img src="hero@3x.acme.com.webp"> x@sentry.io a@wixpress.com joe@gmail.com you@example.com noreply@acme.com jane@acme.com info@acme.com';
    expect(extractEmails(html, "acme.com")).toEqual(["info@acme.com", "jane@acme.com"]);
    expect(extractEmails("support@squarespace.com", "squarespace.com")).toEqual([]);
  });
  it("ranks contact pages first, keeps same site, falls back to common paths", () => {
    const html = '<a href="/privacy-policy">Privacy</a><a href="/about-us">About</a><a href="https://other.com/contact">c</a><a href="/contact">Contact</a><a href="/team">Our team</a>';
    expect(candidatePages(html, "https://acme.com/", 5)).toEqual(["https://acme.com/contact", "https://acme.com/about-us", "https://acme.com/team", "https://acme.com/privacy-policy"]);
    expect(candidatePages("<p>nothing</p>", "https://acme.com/", 5)).toEqual(["https://acme.com/contact", "https://acme.com/contact-us", "https://acme.com/about", "https://acme.com/about-us"]);
  });
});

describe("findOwnSiteEmail", () => {
  it("crawls fallback contact page and retries the www twin", async () => {
    const pages: Record<string, string> = { "https://www.acme.com/": "<p>home</p>", "https://www.acme.com/contact-us": "bob [at] acme [dot] com" };
    const seen: string[] = [];
    const r = await findOwnSiteEmail("https://acme.com/", async (u) => (seen.push(u), pages[u] !== undefined ? { url: u, html: pages[u]! } : null));
    expect(r).toMatchObject({ email: "bob@acme.com", page: "https://www.acme.com/contact-us" });
    expect(seen.length).toBeLessThanOrEqual(1 + 1 + 5);
  });
});

describe("listedEmail", () => {
  it("uses a source email only on the business's own domain", () => {
    expect(listedEmail({ website: "https://www.acme.com", email: "Info@Acme.com" })).toBe("info@acme.com");
    expect(listedEmail({ website: "https://acme.com", email: "acme@gmail.com" })).toBeNull();
    expect(listedEmail({ website: "https://acme.com", email: "x@other.com" })).toBeNull();
    expect(listedEmail({ website: "https://acme.com", email: null })).toBeNull();
  });
});

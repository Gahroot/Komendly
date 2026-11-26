import { describe, expect, it } from "vitest";
import { cleanPartnerTag, embedIframeSnippet, embedSnippet, embedUtm } from "../embed";

describe("embed", () => {
  it("accepts only slug-like partner tags", () => {
    expect(cleanPartnerTag("Acme-Studio")).toBe("acme-studio");
    expect(cleanPartnerTag("a@b.com")).toBe("embed");
    expect(cleanPartnerTag('"><script>')).toBe("embed");
    expect(cleanPartnerTag(null)).toBe("embed");
    expect(cleanPartnerTag("x".repeat(41))).toBe("embed");
  });
  it("builds utm and snippets", () => {
    expect(embedUtm("acme")).toEqual({ utm_source: "embed", utm_medium: "widget", utm_campaign: "acme" });
    expect(embedSnippet("https://www.komendly.com/", "acme")).toContain('src="https://www.komendly.com/embed/komendly-embed.js"');
    expect(embedIframeSnippet("https://www.komendly.com", "acme")).toContain("/embed/ads?p=acme");
  });
});

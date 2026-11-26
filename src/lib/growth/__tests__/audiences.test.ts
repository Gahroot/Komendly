import { describe, expect, it } from "vitest";
import { AUDIENCES, audienceCtaHref, audiencePath, getAudience } from "../audiences";

describe("audiences", () => {
  it("has unique slugs and the requested set", () => {
    const s = AUDIENCES.map((a) => a.slug);
    expect(new Set(s).size).toBe(s.length);
    expect(s).toEqual(expect.arrayContaining(["agencies", "web-designers", "media-buyers", "social-media-managers", "seo-agencies", "shopify-agencies", "branding-agencies", "coaches", "educators", "franchises", "virtual-assistants"]));
  });
  it("never appends the site name and avoids hype/fake claims", () => {
    for (const a of AUDIENCES) {
      expect(a.title).not.toMatch(/komendly/i);
      expect(JSON.stringify(a)).not.toMatch(/guarantee[ds]?\b(?! )|10x|testimonial from|case study/i);
      expect(a.uses).toHaveLength(3);
      expect(a.steps).toHaveLength(3);
    }
  });
  it("builds UTM CTAs", () => {
    expect(audienceCtaHref("agencies", "hero")).toBe("/free-ads?utm_source=audience&utm_medium=landing&utm_campaign=agencies&utm_content=hero");
    expect(audiencePath("coaches")).toBe("/for/coaches");
    expect(getAudience("nope")).toBeUndefined();
  });
});

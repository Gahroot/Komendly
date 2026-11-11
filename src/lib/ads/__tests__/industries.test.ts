import { describe, expect, it } from "vitest";
import { INDUSTRIES, classifyIndustry, galleryCtaHref, getIndustry, industryGuide, relatedIndustries, scoreIndustries, whyItWorks } from "../industries";

const cases: Array<[string, Parameters<typeof classifyIndustry>[0]]> = [
  ["bakeries", { brandName: "Blackbird Bakery", mainOffer: "Artisan sweet and savory baked goods made from scratch with local ingredients", audience: "People on Bainbridge Island seeking treats", url: "https://www.blackbirdbakery.com" }],
  ["roofers", { brandName: "Lakeside Roofing", mainOffer: "Commercial and residential roof installation, replacement, repair, and maintenance", audience: "Homeowners and property owners in Illinois" }],
  ["plumbers", { brandName: "Sweetwater Plumbing", mainOffer: "Plumbing services with a free quote, timely response", audience: "Residential and commercial customers" }],
  ["dentists", { brandName: "SmileArts Dental", mainOffer: "Dental care in Oklahoma City and family dentistry in Yukon.", audience: "Families seeking a dentist" }],
  ["landscapers", { brandName: "Green Acres Landscape and Design", mainOffer: "Custom residential landscape design and installation, plus commercial landscaping and grounds maintenance", audience: "Homeowners" }],
  ["coffee-shops", { brandName: "Four Barrel Coffee", mainOffer: "Independently sourced and roasted coffee", audience: "Coffee shoppers, subscription customers" }],
  ["florists", { brandName: "Lulu's Flowers", mainOffer: "Fresh flowers and gifts delivered to and around Rockport", audience: "People sending flowers" }],
  ["chiropractors", { brandName: "Dr. Joe Nunnari", mainOffer: "Chiropractic care combining hands-on treatment with healing technology", audience: "New patients in Germantown" }],
  ["law-firms", { brandName: "Coonen Law, PLLC", mainOffer: "Estate and business planning, including wills, trusts, business formation", audience: "Families and businesses in Grand Rapids" }],
  ["real-estate-agents", { brandName: "Marian Grout Real Estate", mainOffer: "Real estate services for buying and selling homes, with local market expertise", audience: "Home buyers and sellers in Birmingham" }],
  ["accountants", { brandName: "PK Business Services", mainOffer: "Practical bookkeeping, QuickBooks cleanup, ongoing support", audience: "Small businesses" }],
  ["salons", { brandName: "Salon Buzz", mainOffer: "Hair, beauty and nail services at Chicago's Gold Coast salons", audience: "Chicago clients" }],
  ["yoga-studios", { brandName: "Modo Yoga", mainOffer: "Hot yoga and movement classes in welcoming studios", audience: "People new to yoga" }],
  ["tutors", { brandName: "Boston Tutoring Services", mainOffer: "Personalized online and in-home tutoring, test preparation", audience: "Parents and their PreK-12 students" }],
  ["photographers", { brandName: "Kellyann Photo", mainOffer: "Couples, lifestyle, and wedding photography", audience: "Couples celebrating an engagement" }],
  ["restaurants", { brandName: "Joe's Stone Crab", mainOffer: "A fourth-generation Miami Beach seafood restaurant", audience: "People coming for dining, reservations and walk-ins." }],
  ["saas", { brandName: "Plausible Analytics", mainOffer: "Lightweight, privacy-friendly web analytics", audience: "Site owners" }],
];

describe("classifyIndustry", () => {
  it.each(cases)("classifies %s", (slug, input) => {
    expect(classifyIndustry(input)?.slug).toBe(slug);
  });

  it("returns null for empty or unrelated input", () => {
    expect(classifyIndustry({})).toBeNull();
    expect(classifyIndustry({ brandName: "Acme", mainOffer: "We help with things" })).toBeNull();
  });

  it("ignores malformed fields and is deterministic", () => {
    const input = { brandName: 42, mainOffer: "Roof repair", facts: [{ claim: "roofing since 1990" }, null, "x"], pains: "nope" };
    expect(classifyIndustry(input)?.slug).toBe("roofers");
    expect(scoreIndustries(input)).toEqual(scoreIndustries(input));
  });

  it("matches on word boundaries", () => {
    expect(classifyIndustry({ mainOffer: "competitive appetizers" })).toBeNull();
  });
});

describe("industry data", () => {
  it("has ~40 unique slugs with names", () => {
    expect(INDUSTRIES.length).toBeGreaterThanOrEqual(38);
    expect(new Set(INDUSTRIES.map((i) => i.slug)).size).toBe(INDUSTRIES.length);
    for (const i of INDUSTRIES) expect(i.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("builds a guide, FAQ, related list and UTM link", () => {
    const bakery = getIndustry("bakeries");
    expect(bakery).toBeDefined();
    if (!bakery) return;
    const g = industryGuide(bakery);
    expect(g.faq.length).toBeGreaterThanOrEqual(3);
    expect(g.sections).toHaveLength(3);
    expect(JSON.stringify(g)).not.toMatch(/\d+%/);
    expect(relatedIndustries(bakery, new Set(["roofers"]))[0]?.slug).toBe("roofers");
    expect(galleryCtaHref("bakeries", "end")).toBe("/free-ads?utm_source=seo&utm_medium=gallery&utm_campaign=bakeries&utm_content=end");
  });

  it("explains why an ad works from its own fields", () => {
    expect(whyItWorks({ awareness: "problem_aware", angle: "Leaky roof before the storm.", hook: "x" })).toBe("Angle: Leaky roof before the storm. It speaks to a problem the viewer already feels, before naming the fix.");
  });
});

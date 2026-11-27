import { describe, expect, it, vi } from "vitest";
import { draftGoogleCopy, draftKeywords, draftSearchCopy, isFragment, keywordOk, pickBestGeo, suggestServiceArea, type DraftRunInput } from "../core/draft";
import { displayWidth, searchCopyErrors } from "../core/text";
import type { GeoPick } from "../core/types";
import { draftInputFromExtraction } from "../draft-request";

// Trimmed from a real run (fidelityhi.com): the old drafter made "Money", "With Free Estimates", "What would replacement windows" etc.
const FACTS = [
  ["Free installation with six windows purchased; restrictions may apply. Call for details.", "Free install with 6 windows purchased\n*Restrictions May Apply, Call for Details"],
  ["Buy three windows, get one free; restrictions may apply. Call for details.", "Buy 3 windows, Get one Free"],
  ["0% financing if paid in full in 18 months, subject to credit approval and restrictions. Call for details.", "0% No interest financing if paid in full in 18 months"],
  ["Free estimates available.", "Request Information or a Free Estimate"],
  ["Locally owned and serving the Dallas-Fort Worth Metroplex.", "We are locally owned and service the Dallas-Fort Worth Metroplex."],
  ["Serving Dallas/Fort Worth since 2014.", "Servicing Dallas/Ft. Worth since 2014"],
  ["Professional installation of energy-efficient windows, doors, siding and gutters.", "professional installation of energy efficient windows, doors, siding, & gutters."],
  ["Projects are backed by The Good Contractors List's $25,000 guarantee with free registration before work begins.", "backed by their exclusive $25,000 guarantee"],
  ["Free quotes available.", "Contact Fidelity Windows For A Free Quote!"],
  ["Offers products and professional installation for roofs, gutters, replacement windows, doors, and siding.", "providing high quality products and professional installation of roofs, gutters, replacement windows, doors, and siding."],
  ["Professional home improvement contractor located in Frisco, Texas.", "Fidelity Windows is a professional home improvement contractor located in Frisco, Texas."],
];
const EXTRACTION = {
  brandName: "Fidelity Windows", landingPage: "https://fidelityhi.com/",
  mainOffer: "Professional installation of energy-efficient windows, doors, siding, and gutters to save energy and money, with free estimates and custom financing available.",
  audience: "Customers across the Dallas-Fort Worth Metroplex seeking replacement windows, doors, siding, gutters, roofs, and exterior home improvements.",
  facts: FACTS.map(([claim, quote]) => ({ claim, quote, sourceUrl: "https://fidelityhi.com/" })),
};
const INPUT: DraftRunInput = draftInputFromExtraction(EXTRACTION as never, EXTRACTION.landingPage, EXTRACTION.brandName);
const ADS = [
  { headline: "I want windows that make sense for summer", body: "Energy-efficient windows, professional fitting and a free estimate.", cta: "Request window estimate" },
  { headline: "Saturday in the old house, planning new windows", body: "Ask about replacement windows for an older home.", cta: "Request window estimate" },
  { headline: "What would replacement windows cost?", body: "Start with a free quote from locally owned Fidelity Windows.", cta: "Get window quote" },
];
const BAD_HEADLINES = ["I want windows that make sense", "What would replacement windows", "Saturday in the old house", "Money", "With Free Estimates", "Start with a free quote from"];
const GENERIC_KW = /^(money|free|best|cheap|estimates?|quotes?)( near me)?$|with free estimates|save energy|financing|[.,!?;:]/;

function expectClean(d: { search: { headlines: string[]; descriptions: string[]; path1: string; path2: string }; keywords: Array<{ text: string; match: string }> }) {
  expect(searchCopyErrors(d.search)).toEqual([]);
  for (const h of d.search.headlines) {
    expect(displayWidth(h)).toBeLessThanOrEqual(30);
    expect(isFragment(h)).toBe(false);
    expect(h).not.toMatch(/!|\b[A-Z]{4,}\b/);
    expect(BAD_HEADLINES).not.toContain(h);
  }
  for (const s of d.search.descriptions) { expect(displayWidth(s)).toBeLessThanOrEqual(90); expect(isFragment(s.replace(/[.!?]$/, ""))).toBe(false); }
  expect(d.keywords.length).toBeGreaterThan(0);
  expect(d.keywords.length).toBeLessThanOrEqual(15);
  expect(new Set(d.keywords.map((k) => k.match + k.text)).size).toBe(d.keywords.length);
  for (const k of d.keywords) {
    const n = k.text.split(" ").length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(4);
    expect(k.text).not.toMatch(GENERIC_KW);
  }
}

describe("google draft quality (fidelityhi-style)", () => {
  it("rules drafter: real services, no fragments, no generic keywords, limits respected", () => {
    const search = draftSearchCopy(INPUT, ADS);
    const keywords = draftKeywords(INPUT);
    expectClean({ search, keywords });
    expect(search.headlines).toEqual(expect.arrayContaining(["Fidelity Windows", "Replacement Windows", "Door Installation", "Free Estimates Available"]));
    expect(keywords.map((k) => k.text)).toEqual(expect.arrayContaining(["replacement windows", "door installation", "door installation dallas", "door installation near me"]));
    // Numbers only as written in the facts: "0%" and "$25,000" appear there; nothing invented.
    for (const line of [...search.headlines, ...search.descriptions]) for (const n of line.match(/\d[\d,]*%?/g) ?? []) expect(FACTS.flat().join(" ")).toContain(n);
  });

  it("uses the AI draft, dropping bad lines instead of cutting them", async () => {
    const text = vi.fn(async () => ({
      text: "",
      json: {
        headlines: [
          "Fidelity Windows", "Replacement Windows in Dallas", "Free Estimates Available", "Locally Owned Since 2014", "0% Financing Available",
          "Save 40% On New Windows", "BEST WINDOWS IN TEXAS", "Windows You'll Love!", "Start with a free quote from", "Money",
          "Energy-Efficient Windows and Doors for Every Home", "Siding and Gutter Installation",
        ],
        descriptions: [
          "Professional installation of energy-efficient windows, doors, siding and gutters.",
          "Locally owned and serving the Dallas-Fort Worth Metroplex since 2014. Ask for a free estimate.",
          "Get guaranteed savings of 50% on your energy bill with new windows.",
          "Free estimates and free quotes. Call Fidelity Windows today.",
        ],
        services: ["replacement windows", "doors", "siding", "gutters", "free estimates", "money", "roofs"],
        serviceAreas: ["Dallas-Fort Worth Metroplex", "Atlantis"],
      },
    }));
    const d = await draftGoogleCopy(INPUT, ADS, text);
    expect(text).toHaveBeenCalledOnce();
    const req = (text.mock.calls[0] as unknown[])[0] as { system: string; prompt: string };
    expect(req.prompt).toContain("Free estimates available.");
    expect(req.system).toMatch(/ONLY the facts/);
    expect(d.source).toBe("ai");
    expectClean(d);
    expect(d.search.headlines.slice(0, 5)).toEqual(["Fidelity Windows", "Replacement Windows in Dallas", "Free Estimates Available", "Locally Owned Since 2014", "0% Financing Available"]);
    const all = d.search.headlines.join("|");
    expect(all).not.toMatch(/40%|BEST|Love|quote from|Money|Every Home/);
    expect(d.search.descriptions.join("|")).not.toMatch(/50%/); // number not in the facts
    expect(d.serviceAreas).toContain("Dallas-Fort Worth Metroplex");
    expect(d.serviceAreas).not.toContain("Atlantis"); // not on the site
    expect(d.keywords.map((k) => k.text)).not.toContain("free estimates near me");
  });

  it("falls back to the rules drafter when the AI fails or answers junk", async () => {
    const failing = await draftGoogleCopy(INPUT, ADS, async () => { throw new Error("AI gateway is off"); });
    expect(failing.source).toBe("rules");
    expectClean(failing);
    const junk = await draftGoogleCopy(INPUT, ADS, async () => ({ text: "not json" }));
    expect(junk.source).toBe("rules");
    expect(junk.search).toEqual(failing.search);
  });

  it("keyword filter", () => {
    for (const bad of ["money", "money near me", "with free estimates", "gutters to save energy", "custom financing available. near me", "free estimates", "best", "cheap windows, doors"]) {
      expect([bad, keywordOk(bad)]).toEqual([bad, null]);
    }
    expect(keywordOk("replacement windows near me")).toBe("replacement windows near me");
  });
});

describe("service area geo", () => {
  // Real geoTargetConstants:suggest answers (Nov 2026).
  const SUGGEST: Record<string, GeoPick[]> = {
    "Dallas-Fort Worth Metroplex": [],
    "Dallas-Fort Worth": [
      { kind: "location", id: "1026411", name: "Fort Worth,Texas,United States", type: "City", countryCode: "US" },
      { kind: "location", id: "9060282", name: "Fairmount,Texas,United States", type: "Neighborhood", countryCode: "US" },
    ],
    "Dallas-Ft. Worth": [
      { kind: "location", id: "200623", name: "Dallas-Ft. Worth, TX,Texas,United States", type: "DMA Region", countryCode: "US" },
      { kind: "location", id: "1026339", name: "Dallas,Texas,United States", type: "City", countryCode: "US" },
    ],
  };
  it("suggests the Dallas-Ft. Worth region for 'Dallas-Fort Worth Metroplex'", async () => {
    const search = vi.fn(async (q: string) => SUGGEST[q] ?? []);
    const d = await draftGoogleCopy(INPUT, ADS);
    const pick = await suggestServiceArea(d.serviceAreas, null, search);
    expect(pick).toMatchObject({ kind: "location", id: "200623", type: "DMA Region" });
    expect(search.mock.calls.length).toBeLessThanOrEqual(4);
  });
  it("prefers the city for a plain city name and rejects weak matches", () => {
    const picks: GeoPick[] = [
      { kind: "location", id: "1026339", name: "Dallas,Texas,United States", type: "City", countryCode: "US" },
      { kind: "location", id: "200623", name: "Dallas-Ft. Worth, TX,Texas,United States", type: "DMA Region", countryCode: "US" },
      { kind: "location", id: "9059462", name: "Dallas County,Texas,United States", type: "County", countryCode: "US" },
    ];
    expect(pickBestGeo("Dallas", picks)?.pick).toMatchObject({ id: "1026339" });
    expect(pickBestGeo("Rochester Hills", picks)).toBeNull();
  });
});

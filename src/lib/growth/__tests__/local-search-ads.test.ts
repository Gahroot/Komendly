import { describe, expect, it } from "vitest";
import { GALLERY_PAGES, comboForIndustry } from "../ad-pages";
import {
  RSA_LIMITS, SEARCH_ASK_FOR, SEARCH_GUIDES, SEARCH_LEAVE_OUT, SEARCH_PUT_IN_AD, TIKTOK_AD_TEXT_MAX, TIKTOK_EXAMPLES, TIKTOK_FAQ, TIKTOK_PUT_IN_AD, TIKTOK_SPECS,
  TOWN, TOWN_FIT_CHARS, charCount, searchGuide, searchGuideForPage, withTown,
} from "../local-search-ads";

const LONG_TOWN = "Fort Worth"; // 10 characters
const guides = Object.values(SEARCH_GUIDES);

describe("search ad examples fit Google's responsive search ad limits", () => {
  it("covers plumbers and HVAC, both with a real google combo page", () => {
    expect(guides.map((g) => g.slug).sort()).toEqual(["hvac", "plumbers"]);
    for (const g of guides) {
      expect(comboForIndustry(g.slug, "google")?.path).toBe(`/ad-examples/${g.slug}/google`);
      expect(searchGuideForPage(`combo:google-${g.slug}`)).toBe(g);
    }
    expect(searchGuide("roofers")).toBeUndefined();
    expect(LONG_TOWN.length).toBe(TOWN_FIT_CHARS);
  });

  it("every headline is at most 30 characters, as written and with a 10-character town", () => {
    for (const g of guides) for (const ad of g.ads) {
      expect(ad.headlines.length).toBeGreaterThanOrEqual(RSA_LIMITS.minHeadlines);
      expect(ad.headlines.length).toBeLessThanOrEqual(RSA_LIMITS.maxHeadlines);
      expect(new Set(ad.headlines.map((h) => h.toLowerCase())).size).toBe(ad.headlines.length);
      for (const h of ad.headlines) {
        expect(charCount(h), `${g.slug} "${h}"`).toBeLessThanOrEqual(RSA_LIMITS.headline);
        expect(charCount(withTown(h, LONG_TOWN)), `${g.slug} "${h}" with a longer town`).toBeLessThanOrEqual(RSA_LIMITS.headline);
      }
    }
  });

  it("every description is at most 90 characters, as written and with a 10-character town", () => {
    for (const g of guides) for (const ad of g.ads) {
      expect(ad.descriptions.length).toBeGreaterThanOrEqual(RSA_LIMITS.minDescriptions);
      expect(ad.descriptions.length).toBeLessThanOrEqual(RSA_LIMITS.maxDescriptions);
      for (const d of ad.descriptions) {
        expect(charCount(d), `${g.slug} "${d}"`).toBeLessThanOrEqual(RSA_LIMITS.description);
        expect(charCount(withTown(d, LONG_TOWN)), `${g.slug} "${d}" with a longer town`).toBeLessThanOrEqual(RSA_LIMITS.description);
      }
    }
  });

  it("display paths are at most 15 characters, lowercase and URL-safe", () => {
    for (const g of guides) for (const ad of g.ads) for (const p of [ad.path1, ad.path2]) {
      expect(charCount(p)).toBeLessThanOrEqual(RSA_LIMITS.path);
      expect(p).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("follows Google's editorial basics: no exclamation marks, no ALL CAPS words, no superlatives or guarantees", () => {
    for (const g of guides) for (const ad of g.ads) {
      for (const line of [...ad.headlines, ...ad.descriptions]) {
        expect(line).not.toMatch(/!/);
        expect(line.replace(/\b(AC|HVAC|DIY)\b/g, "")).not.toMatch(/\b[A-Z]{3,}\b/);
        expect(line).not.toMatch(/guarantee|\bbest\b|#1|number one|cheapest|lowest|100%|\bfree\b(?! in-home)/i);
      }
    }
  });

  it("uses the town placeholder, never a business name", () => {
    for (const g of guides) {
      const all = g.ads.flatMap((a) => [...a.headlines, ...a.descriptions]);
      expect(all.some((l) => l.includes(TOWN))).toBe(true);
      expect(all.join(" ")).not.toMatch(/komendly|ozzy/i);
    }
  });

  it("has service content, FAQ answers and the what-to-ask-for / what-to-put-in lists", () => {
    for (const g of guides) {
      expect(g.services.length).toBeGreaterThanOrEqual(4);
      expect(g.ads.length).toBeGreaterThanOrEqual(4);
      for (const s of g.services) { expect(s.searches.length).toBeGreaterThanOrEqual(3); expect(s.adSays.length).toBeGreaterThan(60); }
      expect(g.googleFaq.length).toBeGreaterThanOrEqual(4);
      expect(g.tradeFaq.length).toBeGreaterThanOrEqual(2);
      for (const f of [...g.googleFaq, ...g.tradeFaq]) { expect(f.q.endsWith("?")).toBe(true); expect(f.a.length).toBeGreaterThan(120); }
      expect(new Set([...g.googleFaq, ...g.tradeFaq].map((f) => f.q)).size).toBe(g.googleFaq.length + g.tradeFaq.length);
    }
    expect(SEARCH_ASK_FOR.length).toBeGreaterThanOrEqual(5);
    expect(SEARCH_PUT_IN_AD.length).toBeGreaterThanOrEqual(5);
    expect(SEARCH_LEAVE_OUT.length).toBeGreaterThanOrEqual(3);
  });

  it("the HVAC page answers the 'heating and cooling repair companies' query", () => {
    const hvac = searchGuide("hvac")!;
    expect(hvac.who).toBe("heating and cooling repair companies");
    expect(hvac.tradeTitle).toMatch(/Heating and Cooling/);
    const page = comboForIndustry("hvac", "google")!;
    expect(page.entry.title).toBe("Google Ads for Heating & Cooling (HVAC) Repair Companies");
    expect(page.entry.h1).toMatch(/heating and cooling \(HVAC\) repair companies/);
    expect(page.entry.title).not.toMatch(/\| Komendly/);
    expect(hvac.services.map((s) => s.name).join(" ")).toMatch(/AC repair/);
    expect(hvac.services.map((s) => s.name).join(" ")).toMatch(/Furnace/);
  });
});

describe("TikTok examples", () => {
  it("ad text is at most 100 characters (as written and with a 10-character town) with no emoji, # or braces", () => {
    expect(TIKTOK_EXAMPLES.length).toBeGreaterThanOrEqual(5);
    for (const e of TIKTOK_EXAMPLES) {
      expect(charCount(e.adText), e.adText).toBeLessThanOrEqual(TIKTOK_AD_TEXT_MAX);
      expect(charCount(withTown(e.adText, LONG_TOWN)), e.adText).toBeLessThanOrEqual(TIKTOK_AD_TEXT_MAX);
      expect(e.adText).not.toMatch(/[#{}]|\p{Extended_Pictographic}/u);
      expect(e.shots.length).toBe(3);
      expect(e.hook.length).toBeLessThanOrEqual(40);
    }
    expect(new Set(TIKTOK_EXAMPLES.map((e) => e.trade)).size).toBe(TIKTOK_EXAMPLES.length);
  });
  it("covers plumbers and HVAC, the trades people search for", () => {
    const trades = TIKTOK_EXAMPLES.map((e) => e.trade).join(" ");
    expect(trades).toMatch(/Plumber/);
    expect(trades).toMatch(/HVAC/);
    expect(TIKTOK_PUT_IN_AD.length).toBeGreaterThanOrEqual(5);
    expect(TIKTOK_SPECS.join(" ")).toMatch(/540x960/);
    expect(TIKTOK_FAQ.length).toBeGreaterThanOrEqual(4);
  });
});

describe("copy rules for these pages", () => {
  const strings = (): string[] => [
    ...guides.flatMap((g) => [g.tradeTitle, g.tradeDescription, g.googleDescription, g.who, ...g.services.flatMap((s) => [s.name, ...s.searches, s.adSays]), ...g.ads.flatMap((a) => [a.label, a.why, ...a.headlines, ...a.descriptions]), ...g.googleFaq.flatMap((f) => [f.q, f.a]), ...g.tradeFaq.flatMap((f) => [f.q, f.a])]),
    ...SEARCH_PUT_IN_AD, ...SEARCH_LEAVE_OUT, ...SEARCH_ASK_FOR,
    ...TIKTOK_EXAMPLES.flatMap((e) => [e.trade, e.hook, ...e.shots, e.adText, e.button, e.why]), ...TIKTOK_PUT_IN_AD, ...TIKTOK_SPECS, ...TIKTOK_FAQ.flatMap((f) => [f.q, f.a]),
  ];
  it("never claims Komendly publishes or runs ads, one-click publishing, email verification, prices or results", () => {
    for (const s of strings()) {
      expect(s).not.toMatch(/one[- ]click/i);
      expect(s).not.toMatch(/email (verification|confirmation)/i);
      expect(s).not.toMatch(/Komendly (publishes|posts|runs|manages)\b(?! only)/i);
      expect(s).not.toMatch(/\$\d/);
      if (!SEARCH_LEAVE_OUT.includes(s)) expect(s).not.toMatch(/\b(guaranteed?|roi|more leads|more sales|doubl|tripl)\w*/i);
    }
  });
  it("titles don't append the site name", () => {
    for (const g of guides) { expect(g.tradeTitle).not.toMatch(/Komendly/); expect(g.tradeTitle.length).toBeLessThanOrEqual(70); expect(g.tradeDescription.length).toBeLessThanOrEqual(300); expect(g.googleDescription.length).toBeLessThanOrEqual(300); }
  });
  it("only the google combo pages for these trades exist as pages (no new near-duplicate URLs)", () => {
    for (const g of guides) expect(GALLERY_PAGES.filter((p) => p.industry === g.slug && p.comboPlatform === "google")).toHaveLength(1);
    expect(GALLERY_PAGES.filter((p) => p.key === "platform:tiktok")).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { INDUSTRIES, classifyIndustry } from "../../ads/industries";
import { RESERVED_SEGMENTS } from "../ad-pages";
import { CATEGORIES, EVERGREEN_ANGLES, FREE_OFFER, PLAYBOOKS, SEASONS, allAnglePages, anglePage, anglePageText, anglePairs, playbook, templatizeSample, tradeExampleAds, tradeFaq, tradePage, tradePageText } from "../trade-playbooks";

// Promised results, invented stats or superlatives: never on these pages.
const DISHONEST = /\b(guarantee[ds]?|#1|number one|best in (the )?(town|city|world|country)|\d+\s?%|\d+x (more|leads|sales)|more leads|more sales|roi of|cheapest|cure[sd]?)\b/i;

describe("trade playbooks", () => {
  it("covers 40+ unique trades across all five categories, each mapped to an industry", () => {
    expect(PLAYBOOKS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(PLAYBOOKS.map((p) => p.slug)).size).toBe(PLAYBOOKS.length);
    for (const p of PLAYBOOKS) expect(INDUSTRIES.some((i) => i.slug === p.slug), p.slug).toBe(true);
    for (const c of CATEGORIES) expect(PLAYBOOKS.filter((p) => p.category === c.slug).length).toBeGreaterThanOrEqual(4);
  });

  it("every playbook has enough substance", () => {
    for (const p of PLAYBOOKS) {
      expect(p.hooks.length, p.slug).toBeGreaterThanOrEqual(4);
      expect(p.offers.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.proof.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(Object.keys(p.seasonal).length, p.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it("trade pages make no promises or invented stats, and say the free offer", () => {
    for (const p of PLAYBOOKS) {
      const t = tradePage(p.slug)!;
      const text = tradePageText(t);
      expect(DISHONEST.test(text), `${p.slug}: ${text.match(DISHONEST)?.[0]}`).toBe(false);
      expect(t.budget).toMatch(/^Guidance, not a promise/);
      expect(tradeFaq(p).some((f) => f.a.includes(FREE_OFFER))).toBe(true);
      expect(t.path).toBe(`/ad-examples/${p.slug}`);
    }
    expect(tradePage("nope")).toBeNull();
  });

  it("example ads use placeholders, never business names", () => {
    for (const p of PLAYBOOKS) {
      const ads = tradeExampleAds(p);
      expect(ads).toHaveLength(3);
      for (const a of ads) {
        expect(a.business).toMatch(/ ad$/);
        expect(a.city).toBe("[your town]");
        expect(a.primaryText).toContain("[");
        expect(a.headline.length).toBeLessThanOrEqual(60);
        expect(a.primaryText.length).toBeLessThanOrEqual(400);
        expect(a.offer).not.toMatch(/\(/);
      }
    }
  });

  it("angle pages: evergreen per category + seasonal where the category has ideas, all honest and non-empty", () => {
    const pages = allAnglePages();
    const seasonal = CATEGORIES.reduce((n, c) => n + SEASONS.filter((s) => c.seasons[s.key]).length, 0);
    expect(pages).toHaveLength(CATEGORIES.length * EVERGREEN_ANGLES.length + seasonal);
    expect(pages.length).toBeGreaterThanOrEqual(35);
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length);
    for (const a of pages) {
      expect(a.rows.length, a.path).toBeGreaterThan(0);
      expect(a.faq.length).toBeGreaterThanOrEqual(3);
      expect(DISHONEST.test(anglePageText(a)), `${a.path}: ${anglePageText(a).match(DISHONEST)?.[0]}`).toBe(false);
      expect(a.path).toMatch(/^\/ad-examples\/ideas\/[a-z-]+\/[a-z-]+$/);
    }
    expect(anglePairs()).toHaveLength(pages.length);
    expect(anglePage("home-services", "black-friday")?.h1).toBe("Black Friday ad ideas for home service businesses");
    expect(anglePage("home-services", "valentines-day")).toBeNull();
    expect(anglePage("nope", "hooks")).toBeNull();
  });

  it("'ideas' is reserved and never an industry slug; new trades classify", () => {
    expect(RESERVED_SEGMENTS as readonly string[]).toContain("ideas");
    expect(INDUSTRIES.some((i) => i.slug === "ideas")).toBe(false);
    expect(classifyIndustry({ brandName: "Riverside Animal Hospital", mainOffer: "Veterinary care, vaccines and spay/neuter" })?.slug).toBe("veterinarians");
    expect(classifyIndustry({ brandName: "Oak Tree Service", mainOffer: "Tree removal, tree trimming and stump grinding" })?.slug).toBe("tree-services");
    expect(playbook("roofers")?.category).toBe("home-services");
  });
});

describe("templatizeSample", () => {
  it("replaces the fictional business and town with placeholders", () => {
    const s = templatizeSample({ business: "Summit Roofing Co", city: "Leeds, UK", headline: "Summit Roofing Co in Leeds", primaryText: "Storm hit Leeds? Summit Roofing Co checks your roof free. Call today.", hook: "Leeds roofs took a beating", offer: "Free inspection", cta: "Call now", angle: "Local Leeds proof" });
    expect(s.business).toBe("Example ad");
    expect(s.city).toBe("[your town]");
    const all = [s.headline, s.primaryText, s.hook, s.angle].join(" ");
    expect(all).not.toMatch(/Summit|Leeds/);
    expect(s.headline).toBe("[Your business] in [your town]");
  });
});

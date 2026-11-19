import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "@/lib/ads/industries";
import { GALLERY_PAGES, RESERVED_SEGMENTS, comboForIndustry, contentText, galleryGenerationOrder, galleryPage, galleryCycleConfig, galleryPagePrompt, matchAds, pageSubstance, pickGalleryPages, similarity, siblingKeys, tooSimilar } from "../ad-pages";
import { FACEBOOK_COMBOS, GOOGLE_COMBOS, VOCABULARY, normTerm, termIndex } from "../vocabulary";

describe("gallery vocabulary", () => {
  it("has unique keys, slugs per kind and paths", () => {
    expect(new Set(VOCABULARY.map((e) => e.key)).size).toBe(VOCABULARY.length);
    expect(new Set(GALLERY_PAGES.map((p) => p.path)).size).toBe(GALLERY_PAGES.length);
  });
  it("maps every term to exactly one page", () => {
    const idx = termIndex();
    for (const e of VOCABULARY) expect(idx.get(normTerm(e.primaryQuery))).toBe(e.key);
  });
  it("URL scheme can't collide with industry slugs", () => {
    for (const s of RESERVED_SEGMENTS) expect(INDUSTRIES.some((i) => i.slug === s)).toBe(false);
  });
  it("only builds combo pages for planned industries that exist", () => {
    expect(Object.keys(FACEBOOK_COMBOS)).toHaveLength(12);
    for (const k of Object.keys(FACEBOOK_COMBOS)) expect(INDUSTRIES.some((i) => i.slug === k)).toBe(true);
    expect(GALLERY_PAGES.find((p) => p.key === "combo:facebook-plumbers")?.path).toBe("/ad-examples/plumbers/facebook");
  });
  it("every page has real guidance and FAQ", () => {
    for (const p of GALLERY_PAGES) {
      expect(p.entry.title).not.toMatch(/Komendly/);
      expect(p.entry.guidance.length).toBeGreaterThanOrEqual(3);
      expect(p.entry.faq.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("substance / index rule", () => {
  it("needs tips plus samples or real ads", () => {
    expect(pageSubstance({ realAds: 0, samples: 0, tips: 0 }).indexable).toBe(false);
    expect(pageSubstance({ realAds: 5, samples: 0, tips: 0 }).indexable).toBe(false);
    expect(pageSubstance({ realAds: 0, samples: 4, tips: 4 }).indexable).toBe(true);
    expect(pageSubstance({ realAds: 3, samples: 0, tips: 3 }).indexable).toBe(true);
    expect(pageSubstance({ realAds: 2, samples: 2, tips: 4 }).indexable).toBe(false);
  });
  it("matches real ads by industry and shape", () => {
    const ads = [{ industry: "plumbers", width: 1080, height: 1080 }, { industry: "plumbers", width: 1080, height: 1920 }, { industry: "gyms", width: 1080, height: 1350 }];
    const by = (k: string) => GALLERY_PAGES.find((p) => p.key === k)!;
    expect(matchAds(by("combo:facebook-plumbers"), ads)).toHaveLength(2);
    expect(matchAds(by("platform:tiktok"), ads)).toHaveLength(1);
    expect(matchAds(by("format:carousel"), ads)).toHaveLength(1);
    expect(matchAds(by("occasion:hiring"), ads)).toHaveLength(0);
  });
});

describe("near-duplicate check", () => {
  const a = "Black Friday ads for small shops work when the deal is clear and the end time is real. Show one number and a reason to buy local.";
  it("flags near copies and passes different copy", () => {
    expect(similarity(a, a)).toBe(1);
    expect(tooSimilar(a.replace("small shops", "local shops"), [{ key: "x", text: a }])?.key).toBe("x");
    expect(tooSimilar("Hiring ads need pay, hours and a fast way to apply, with real staff photos instead of stock models.", [{ key: "x", text: a }])).toBeNull();
  });
  it("siblings are same-kind pages", () => {
    const p = GALLERY_PAGES.find((x) => x.key === "occasion:christmas")!;
    expect(siblingKeys(p).every((k) => k.startsWith("occasion:") && k !== p.key)).toBe(true);
    const c = { intro: "i", whatWorks: [{ title: "t", detail: "d" }], samples: [] };
    expect(contentText(c as never)).toContain("t d");
  });
});

describe("engine page-key selection", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  const cfg = galleryCycleConfig({});
  it("defaults are modest", () => expect(cfg).toEqual({ perCycle: 3, dailyCap: 6, refreshDays: 60 }));
  it("fills missing first, then stalest, within per-cycle and daily caps", () => {
    const existing = [{ key: "a", generatedAt: new Date("2026-08-01T00:00:00Z") }, { key: "b", generatedAt: new Date("2026-11-18T06:00:00Z") }];
    expect(pickGalleryPages(["a", "b", "c", "d"], existing, cfg, now)).toEqual(["c", "d", "a"]);
    expect(pickGalleryPages(["a", "b", "c", "d"], existing, { ...cfg, dailyCap: 2 }, now)).toEqual(["c"]);
    expect(pickGalleryPages(["a", "b", "c", "d"], existing, { ...cfg, dailyCap: 0 }, now)).toEqual([]);
    expect(galleryCycleConfig({ GALLERY_PAGES_DAILY_CAP: "0" }).dailyCap).toBe(0);
  });
  it("prompt is intent-specific and steers away on retry", () => {
    const p = GALLERY_PAGES.find((x) => x.key === "combo:facebook-roofers")!;
    expect(galleryPagePrompt(p).prompt).toContain("roofer");
    expect(galleryPagePrompt(p, "SIBLING TEXT").prompt).toContain("SIBLING TEXT");
  });
});

describe("new platform, occasion and google combo pages", () => {
  const keys = GALLERY_PAGES.map((p) => p.key);
  it("adds the planned pages with the right paths and shapes", () => {
    for (const s of ["linkedin", "google-search", "youtube", "pinterest", "snapchat", "reddit", "x"]) expect(keys).toContain(`platform:${s}`);
    for (const s of ["valentines-day", "easter", "fathers-day", "back-to-school", "halloween", "summer-sale", "new-year", "fourth-of-july", "thanksgiving"]) expect(keys).toContain(`occasion:${s}`);
    expect(keys).not.toContain("occasion:cyber-monday");
    expect(galleryPage("platform:google-search")!.shape).toBe("none");
    expect(galleryPage("combo:google-plumbers")!.path).toBe("/ad-examples/plumbers/google");
    expect(galleryPage("combo:facebook-plumbers")!.path).toBe("/ad-examples/plumbers/facebook");
    expect(comboForIndustry("plumbers")!.key).toBe("combo:facebook-plumbers");
    expect(comboForIndustry("plumbers", "google")!.key).toBe("combo:google-plumbers");
    expect(comboForIndustry("bakeries", "google")).toBeUndefined();
  });
  it("google combos exist as industries; slugs and titles are clean", () => {
    for (const s of Object.keys(GOOGLE_COMBOS)) expect(INDUSTRIES.some((i) => i.slug === s)).toBe(true);
    for (const kind of ["platform", "format", "occasion", "combo"]) {
      const slugs = GALLERY_PAGES.filter((p) => p.kind === kind).map((p) => p.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
    for (const p of GALLERY_PAGES) {
      expect(p.entry.title).not.toMatch(/\| Komendly/);
      expect(p.entry.guidance.length).toBeGreaterThanOrEqual(3);
      if (p.kind !== "combo") expect(RESERVED_SEGMENTS as readonly string[]).toContain(p.path.split("/")[2]);
    }
  });
  it("non-Meta platform pages say Komendly doesn't publish there", () => {
    for (const s of ["linkedin", "google-search", "youtube", "pinterest", "snapchat", "reddit", "x"]) expect(galleryPage(`platform:${s}`)!.entry.intro).toMatch(/Komendly (does not|publishes only)/);
    for (const k of Object.keys(GOOGLE_COMBOS)) expect(galleryPage(`combo:google-${k}`)!.entry.intro).toContain("publishes only to Facebook and Instagram");
  });
  it("generation order puts high-demand new pages first and covers every page once", () => {
    const o = galleryGenerationOrder();
    expect(o.slice(0, 4)).toEqual(["platform:google-search", "platform:linkedin", "platform:youtube", "occasion:valentines-day"]);
    expect(o[4]).toMatch(/^combo:google-/);
    expect([...o].sort()).toEqual([...keys].sort());
  });
  it("search pages ask for text ads within RSA limits; LinkedIn is B2B; prompts stay honest", () => {
    const g = galleryPagePrompt(galleryPage("platform:google-search")!).prompt;
    expect(g).toContain("responsive search ads");
    expect(g).toContain("90 characters");
    const c = galleryPagePrompt(galleryPage("combo:google-roofers")!).prompt;
    expect(c).toContain("negative keywords");
    expect(c).toContain("roofer");
    expect(c).toContain("<=27 characters");
    expect(galleryPagePrompt(galleryPage("platform:linkedin")!).prompt).toContain("B2B");
    expect(galleryPagePrompt(galleryPage("platform:facebook")!).prompt).toContain("headline (<=40 chars)");
    expect(galleryPagePrompt(galleryPage("combo:facebook-roofers")!).prompt).toContain("Facebook ads");
  });
  it("new siblings are covered by the duplicate check", () => {
    expect(siblingKeys(galleryPage("platform:linkedin")!)).toContain("platform:google-search");
    expect(siblingKeys(galleryPage("combo:google-hvac")!)).toContain("combo:facebook-hvac");
  });
});

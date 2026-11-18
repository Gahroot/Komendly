import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "@/lib/ads/industries";
import { GALLERY_PAGES, RESERVED_SEGMENTS, contentText, galleryCycleConfig, galleryPagePrompt, matchAds, pageSubstance, pickGalleryPages, similarity, siblingKeys, tooSimilar } from "../ad-pages";
import { FACEBOOK_COMBOS, VOCABULARY, normTerm, termIndex } from "../vocabulary";

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

import { describe, expect, it } from "vitest";
import { indexNowBody, industryCycleConfig, pickIndustriesForCycle, readIndustryContent, validateIndustryContent } from "../industry-examples";
import { galleryCtaHref } from "@/lib/ads/industries";

const sample = (business: string) => ({ business, city: "Leeds", headline: "Fresh bread by 7am", primaryText: "Warm sourdough before work. Order online and pick up on your way.", hook: "Still buying sliced bread?", offer: "Free coffee with any loaf", cta: "Order now", angle: "Specific time plus a small offer." });
const content = {
  intro: "Bakery ads work when they show the food up close and give a reason to visit this week.",
  whatWorks: [1, 2, 3].map((n) => ({ title: `Tip ${n}`, detail: "Show the product up close in natural light." })),
  samples: [sample("Rye & Co"), sample("Crumb Corner"), sample("Oven Door")],
};

describe("industry content validation", () => {
  it("accepts valid content and rejects duplicates, banned claims and thin content", () => {
    expect(validateIndustryContent(content).ok).toBe(true);
    expect(validateIndustryContent({ ...content, samples: [sample("A1"), sample("A1"), sample("B")] }).ok).toBe(false);
    expect(validateIndustryContent({ ...content, intro: content.intro + " Results guaranteed for everyone." }).ok).toBe(false);
    expect(validateIndustryContent({ ...content, samples: content.samples.slice(0, 2) }).ok).toBe(false);
    expect(readIndustryContent(null)).toBeNull();
  });
});

describe("pickIndustriesForCycle", () => {
  const now = new Date("2026-11-18T00:00:00Z");
  it("fills missing industries first, then the stalest beyond the refresh window", () => {
    const existing = [
      { industry: "a", generatedAt: new Date("2026-09-01T00:00:00Z") },
      { industry: "b", generatedAt: new Date("2026-11-10T00:00:00Z") },
      { industry: "c", generatedAt: new Date("2026-08-01T00:00:00Z") },
    ];
    expect(pickIndustriesForCycle(["a", "b", "c", "d"], existing, 3, now, 30)).toEqual(["d", "c", "a"]);
    expect(pickIndustriesForCycle(["a", "b"], existing, 3, now, 30)).toEqual(["a"]);
    expect(pickIndustriesForCycle(["d"], [], 0, now)).toEqual([]);
  });
  it("config defaults", () => {
    expect(industryCycleConfig({})).toEqual({ perCycle: 3, refreshDays: 30 });
  });
});

describe("links", () => {
  it("industry CTAs carry industry_examples attribution and IndexNow uses the key file", () => {
    expect(galleryCtaHref("bakeries", "url_box")).toContain("utm_source=examples");
    const b = indexNowBody("https://www.komendly.com", ["https://www.komendly.com/ad-examples/bakeries"]);
    expect(b.host).toBe("www.komendly.com");
    expect(b.keyLocation).toBe("https://www.komendly.com/78c8478292a52ad65d0087edc113df99.txt");
  });
});

import { describe, expect, it } from "vitest";
import { AD_SIZE_GUIDE, AI_TOOL_FIELDS, AI_TOOL_INPUT, AI_TOOL_OUTPUT, AI_TOOL_SECTIONS, FREE_TOOLS, LEGACY_TOOL_SLUGS, NAME_OUTPUT, PLATFORM_LIMITS, REVIEW_OUTPUT, TOOL_GROUPS, aiToolPrompt, budgetMath, buildHashtags, checkAdSize, checkLength, dailyCap, getFreeTool, gradeAdCopy, isAiTool, isFreeToolSlug, parseAiToolInput, perIpHourly, pickCta, startOfUtcDay, underDailyCap, HEADLINE_OUTPUT, type AiToolSlug } from "../free-tools";
import { TOOL_VOCAB, VOCABULARY, normTerm, termIndex } from "../vocabulary";
import { toolCtaHref } from "../free-tools-links";

describe("free tools registry", () => {
  it("slugs are unique, url-safe and titles never carry the site suffix", () => {
    const slugs = FREE_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const t of FREE_TOOLS) {
      expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.faq.length).toBeGreaterThan(0);
    }
    expect(getFreeTool("ad-copy-grader")?.ai).toBe(false);
    expect(isFreeToolSlug("nope")).toBe(false);
    expect(isAiTool("ad-copy-generator")).toBe(true);
    expect(isAiTool("ad-size-guide")).toBe(false);
  });
  it("CTA links carry the free_tools attribution", () => {
    expect(toolCtaHref("ad-copy-grader", "end")).toBe("/free-ads?utm_source=free_tool&utm_medium=acquire&utm_campaign=ad-copy-grader&utm_content=end");
  });
});

describe("caps", () => {
  it("daily cap and per-IP limit are env-configurable with modest defaults", () => {
    expect(dailyCap({})).toBe(200);
    expect(dailyCap({ FREE_TOOLS_DAILY_CAP: "50" })).toBe(50);
    expect(dailyCap({ FREE_TOOLS_DAILY_CAP: "0" })).toBe(0);
    expect(dailyCap({ FREE_TOOLS_DAILY_CAP: "x" })).toBe(200);
    expect(perIpHourly({})).toBe(6);
    expect(perIpHourly({ FREE_TOOLS_PER_IP_HOUR: "0" })).toBe(6);
    expect(underDailyCap(199, 200)).toBe(true);
    expect(underDailyCap(200, 200)).toBe(false);
    expect(underDailyCap(0, 0)).toBe(false);
    expect(startOfUtcDay(new Date("2026-11-18T23:59:00Z")).toISOString()).toBe("2026-11-18T00:00:00.000Z");
  });
});

describe("AI input/output validation", () => {
  it("rejects too-short input and accepts real descriptions", () => {
    expect(parseAiToolInput("ad-copy-generator", { business: "bakery" }).ok).toBe(false);
    expect(parseAiToolInput("ad-copy-generator", { business: "Family bakery in Leeds with sourdough and cakes", platform: "google" }).ok).toBe(true);
    expect(parseAiToolInput("testimonial-generator", {}).ok).toBe(false);
    expect(HEADLINE_OUTPUT.safeParse({ headlines: ["a"], primaryTexts: [], hooks: [] }).success).toBe(false);
  });
});

describe("gradeAdCopy", () => {
  it("scores a strong ad high and a weak one low", () => {
    const good = gradeAdCopy("Fresh sourdough by 7am", "Tired of stale bread? Your loaf is baked at 5am, 2 minutes from home. Order today for pickup.");
    expect(good.score).toBeGreaterThanOrEqual(80);
    const bad = gradeAdCopy("WE ARE THE BEST BAKERY IN THE WHOLE ENTIRE CITY OF LEEDS AND BEYOND", "WE MAKE BREAD!!! WE LOVE OUR BREAD AND OUR BAKERS AND WE THINK OUR SHOP IS GREAT AND WE HAVE BEEN DOING THIS FOR A VERY LONG TIME WITH LOTS OF LOVE");
    expect(bad.score).toBeLessThan(50);
    expect(good.checks.reduce((n, c) => n + c.max, 0)).toBe(100);
  });
});

describe("checkAdSize", () => {
  it("detects perfect fits, crops and too-small images", () => {
    const r = checkAdSize(1080, 1350);
    expect(r.fits.find((f) => f.placement.id === "feed_45")?.fit).toBe("perfect");
    expect(r.fits.find((f) => f.placement.id === "stories")?.fit).toBe("cropped");
    expect(checkAdSize(300, 300).fits.every((f) => f.fit === "too_small")).toBe(true);
    expect(checkAdSize(800, 800).warnings.length).toBe(1);
  });
});

describe("tool contracts", () => {
  const ai = Object.keys(AI_TOOL_INPUT) as AiToolSlug[];
  it("every AI tool has output, sections, form fields or own form, and a prompt that carries the input", () => {
    expect(ai.sort()).toEqual(FREE_TOOLS.filter((t) => t.ai).map((t) => t.slug).sort());
    expect(Object.keys(AI_TOOL_OUTPUT).sort()).toEqual([...ai].sort());
    for (const tool of ai) {
      expect(AI_TOOL_SECTIONS[tool].length).toBeGreaterThan(0);
      if (tool !== "testimonial-generator") expect(AI_TOOL_FIELDS[tool]?.length).toBeGreaterThan(0);
      const { prompt } = aiToolPrompt(tool, { business: "Mobile dog grooming in Austin", review: "Lovely groomer, came on time", post: "Spring offer", product: "Dog grooming van", offer: "10% off", occasion: "sale" });
      expect(prompt.length).toBeGreaterThan(40);
    }
    expect(aiToolPrompt("ad-copy-generator", { business: "Plumber in Leeds", platform: "google" }).prompt).toContain("30 characters");
    expect(aiToolPrompt("testimonial-generator", { review: "They fixed our boiler in an hour" }).prompt).toContain("never add claims");
  });
  it("outputs validate", () => {
    expect(REVIEW_OUTPUT.safeParse({ quotes: ["Fixed in an hour", "On time"], headline: "Fixed in an hour", primaryText: "Our customer said it best." }).success).toBe(true);
    expect(NAME_OUTPUT.safeParse({ names: [] }).success).toBe(false);
    expect(HEADLINE_OUTPUT.safeParse({ headlines: Array(12).fill("Plumber in Leeds 24/7"), primaryTexts: ["Call now for a fixed price.", "Local for 20 years. Book now."], hooks: ["24/7", "Fixed fee"] }).success).toBe(true);
  });
  it("legacy slugs point at live tools and groups are all used", () => {
    for (const [old, now] of Object.entries(LEGACY_TOOL_SLUGS)) { expect(isFreeToolSlug(old)).toBe(false); expect(isFreeToolSlug(now)).toBe(true); }
    for (const [g] of TOOL_GROUPS) expect(FREE_TOOLS.some((t) => t.group === g)).toBe(true);
  });
});

describe("pure helpers", () => {
  it("budgetMath", () => {
    const r = budgetMath({ dailyBudget: 20, cpc: 1, conversionRatePct: 5, orderValue: 50, marginPct: 40, days: 10 });
    expect(r.spend).toBe(200);
    expect(r.clicks).toBe(200);
    expect(r.conversions).toBe(10);
    expect(r.revenue).toBe(500);
    expect(r.roas).toBe(2.5);
    expect(r.breakEvenRoas).toBe(2.5);
    expect(budgetMath({ dailyBudget: 0, cpc: 0, conversionRatePct: 0, orderValue: 0, marginPct: 0 }).spend).toBe(0);
  });
  it("checkLength and platform limits", () => {
    expect(checkLength("", { max: 30, visible: null }).status).toBe("empty");
    expect(checkLength("x".repeat(31), { max: 30, visible: null }).status).toBe("over");
    expect(checkLength("x".repeat(130), { max: null, visible: 125 }).status).toBe("truncated");
    expect(checkLength("ok", { max: 30, visible: null }).status).toBe("ok");
    expect(PLATFORM_LIMITS.find((p) => p.id === "google")?.fields.some((f) => f.max === 30)).toBe(true);
  });
  it("pickCta falls back to Meta buttons", () => {
    expect(pickCta("book", "meta").buttons).toContain("Book Now");
    expect(pickCta("call", "unknown").buttons).toEqual(["Call Now"]);
    expect(pickCta("leads", "google").tip).toMatch(/no button/);
  });
  it("buildHashtags", () => {
    const h = buildHashtags({ business: "Bakery", city: "Leeds", keywords: "sourdough, birthday cakes" });
    expect(h.local).toContain("#leedsbakery");
    expect(h.niche).toContain("#sourdough");
    expect(h.suggested.length).toBeLessThanOrEqual(5);
    expect(buildHashtags({ business: "Café & Bar" }).broad[0]).toBe("#cafeandbar");
  });
  it("size guide covers the searched platforms with unique anchors", () => {
    const ids = AD_SIZE_GUIDE.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["facebook", "instagram", "tiktok", "google-business-post", "nextdoor"]) expect(ids).toContain(id);
  });
});

describe("tool vocabulary", () => {
  it("one vocab entry per tool, filled in, no duplicate slug or term", () => {
    expect(TOOL_VOCAB.map((v) => v.slug).sort()).toEqual(FREE_TOOLS.map((t) => t.slug).sort());
    for (const v of TOOL_VOCAB) {
      expect(v.title).not.toContain("Komendly");
      expect(v.h1 && v.intro && v.primaryQuery).toBeTruthy();
      expect(v.faq.length + (getFreeTool(v.slug)?.faq.length ?? 0)).toBeGreaterThanOrEqual(2);
      const own = [v.primaryQuery, ...v.synonyms, ...v.slang].map(normTerm);
      expect(new Set(own).size).toBe(own.length);
    }
    expect(() => termIndex(VOCABULARY)).not.toThrow();
  });
  it("testimonial tool says real reviews only", () => {
    const v = TOOL_VOCAB.find((x) => x.slug === "testimonial-generator");
    expect(v?.intro).toMatch(/real customer/);
    expect(v?.faq.some((f) => /fake/i.test(f.q))).toBe(true);
  });
});

describe("new tools: ugc, linkedin, rsa, youtube, mockup", () => {
  it("RSA output enforces Google limits by dropping, never truncating", async () => {
    const { RSA_OUTPUT, RSA_LIMITS, cleanRsa } = await import("../free-tools");
    const hs = Array.from({ length: 16 }, (_, i) => ({ text: `  Emergency Plumber Leeds ${i}  `, pin: i < 4 ? "1" : "none" }));
    const r = cleanRsa({ headlines: [{ text: "x".repeat(31) }, ...hs, { text: "emergency plumber leeds 0" }], descriptions: [{ text: "y".repeat(91) }, { text: "Fixed call-out fee. Book today." }], paths: ["  plumber ", "x".repeat(16), "leeds", "more"] });
    expect(r.headlines).toHaveLength(RSA_LIMITS.maxHeadlines);
    expect(r.headlines.every((x) => x.text.length <= 30 && x.text === x.text.trim())).toBe(true);
    expect(r.headlines.filter((x) => x.pin === "1")).toHaveLength(2);
    expect(r.descriptions.map((d) => d.text)).toEqual(["Fixed call-out fee. Book today."]);
    expect(r.paths).toEqual(["plumber", "leeds"]);
    expect(RSA_OUTPUT.safeParse({ headlines: hs, descriptions: [{ text: "y".repeat(91), pin: "none" }, { text: "z".repeat(95), pin: "none" }], paths: [] }).success).toBe(false);
    expect(RSA_OUTPUT.safeParse({ headlines: hs, descriptions: [{ text: "Call now.", pin: "none" }, { text: "Book today.", pin: "none" }], paths: [] }).success).toBe(true);
  });
  it("LinkedIn output keeps intro <= 150, headline <= 70 and LinkedIn's own CTA buttons", async () => {
    const { LINKEDIN_OUTPUT, LINKEDIN_CTAS } = await import("../free-tools");
    const v = (intro: string, headline = "Payroll in 15 minutes", cta = "Learn More") => ({ angle: "a", intro, headline, description: "d", cta });
    const ok = LINKEDIN_OUTPUT.safeParse({ variants: [v("short intro"), v("x".repeat(151)), v("fine"), v("ok", "h".repeat(71))] });
    expect(ok.success && ok.data.variants.length).toBe(2);
    expect(LINKEDIN_OUTPUT.safeParse({ variants: [v("a", "b", "Shop Now"), v("c")] }).success).toBe(false);
    expect(LINKEDIN_CTAS).toContain("Request Demo");
    expect(aiToolPrompt("linkedin-ad-copy-generator", { offer: "Payroll software" }).prompt).toContain("150 characters");
  });
  it("video script prompts follow the chosen length/format", async () => {
    const { VIDEO_SCRIPT_OUTPUT, scriptWordBudget } = await import("../free-tools");
    expect(aiToolPrompt("ugc-script-generator", { product: "Phone mount", length: "60" }).prompt).toContain("60 seconds");
    expect(aiToolPrompt("youtube-ad-script-generator", { product: "Spanish lessons", format: "bumper" }).prompt).toContain("6-second");
    expect(aiToolPrompt("youtube-ad-script-generator", { product: "Spanish lessons" }).prompt).toContain("0-5s");
    expect(scriptWordBudget(15)).toBeLessThan(scriptWordBudget(30));
    expect(parseAiToolInput("ugc-script-generator", { product: "Phone mount for cars", length: "45" }).ok).toBe(false);
    expect(parseAiToolInput("google-ads-headline-generator", { business: "Plumber in Leeds, 24/7 call-outs" }).ok).toBe(false);
    expect(VIDEO_SCRIPT_OUTPUT.safeParse({ scripts: [] }).success).toBe(false);
  });
  it("mockup helpers cut text like the feeds and wrap", async () => {
    const { visibleAdText, wrapText, displayDomain, MOCKUP_FRAMES } = await import("../free-tools");
    expect(visibleAdText("short", 125, "See more")).toEqual({ text: "short", cut: false });
    const long = visibleAdText("word ".repeat(40), 125, "See more");
    expect(long.cut).toBe(true);
    expect(long.text.endsWith("… See more")).toBe(true);
    expect(wrapText((s) => s.length, "aaa bbb ccc ddd", 7, 5)).toEqual(["aaa bbb", "ccc ddd"]);
    expect(wrapText((s) => s.length, "aaa bbb ccc ddd eee", 7, 2)[1].endsWith("…")).toBe(true);
    expect(displayDomain("https://www.fastflow.co.uk/path")).toBe("fastflow.co.uk");
    expect(MOCKUP_FRAMES.map((f) => f.id)).toEqual(["facebook-feed", "instagram-feed", "instagram-story", "tiktok", "linkedin-feed"]);
    expect(isAiTool("ad-mockup-generator")).toBe(false);
  });
  it("RSA page and ad copy generator split the Google intent and cross-link", () => {
    const idx = termIndex(VOCABULARY);
    expect(idx.get(normTerm("google ad copy generator"))).toBe("tool:ad-copy-generator");
    for (const q of ["google ads headline generator", "rsa headline generator", "responsive search ad generator"]) expect(idx.get(normTerm(q))).toBe("tool:google-ads-headline-generator");
    expect(getFreeTool("ad-copy-generator")?.related).toContain("google-ads-headline-generator");
    expect(getFreeTool("google-ads-headline-generator")?.related).toContain("ad-copy-generator");
    for (const t of FREE_TOOLS) for (const r of t.related ?? []) { expect(isFreeToolSlug(r)).toBe(true); expect(r).not.toBe(t.slug); }
  });
  it("tool page copy is not near-duplicate across tools", async () => {
    const { similarity, MAX_SIBLING_SIMILARITY } = await import("../ad-pages");
    const text = (v: (typeof TOOL_VOCAB)[number]) => [v.intro, ...v.guidance, ...v.faq.map((f) => `${f.q} ${f.a}`)].join(" ");
    for (const a of TOOL_VOCAB) for (const b of TOOL_VOCAB) if (a.slug < b.slug) expect(similarity(text(a), text(b)), `${a.slug} vs ${b.slug}`).toBeLessThanOrEqual(MAX_SIBLING_SIMILARITY);
  });
});

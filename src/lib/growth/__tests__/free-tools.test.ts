import { describe, expect, it } from "vitest";
import { FREE_TOOLS, checkAdSize, dailyCap, getFreeTool, gradeAdCopy, isAiTool, isFreeToolSlug, parseAiToolInput, perIpHourly, startOfUtcDay, underDailyCap, HEADLINE_OUTPUT } from "../free-tools";
import { toolCtaHref } from "../free-tools-links";

describe("free tools registry", () => {
  it("slugs are unique, url-safe and titles never carry the site suffix", () => {
    const slugs = FREE_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const t of FREE_TOOLS) {
      expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.title).not.toContain("| Komendly");
      expect(t.faq.length).toBeGreaterThan(0);
    }
    expect(getFreeTool("ad-copy-grader")?.ai).toBe(false);
    expect(isFreeToolSlug("nope")).toBe(false);
    expect(isAiTool("ad-headline-generator")).toBe(true);
    expect(isAiTool("ad-size-checker")).toBe(false);
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
    expect(parseAiToolInput("ad-headline-generator", { business: "bakery" }).ok).toBe(false);
    expect(parseAiToolInput("ad-headline-generator", { business: "Family bakery in Leeds with sourdough and cakes" }).ok).toBe(true);
    expect(parseAiToolInput("review-to-ad", {}).ok).toBe(false);
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
    expect(checkAdSize(400, 400).fits.every((f) => f.fit === "too_small")).toBe(true);
    expect(checkAdSize(800, 800).warnings.length).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { clip, creativeFilename, HEADLINE_MAX, metaCtaFor, placementsFor, PRIMARY_TEXT_MAX, ratioOf, SHARE_LINK_SECONDS, suggestAdCopy } from "../meta-kit";

describe("meta-kit", () => {
  it("maps obvious CTAs to Meta call_to_action types", () => {
    expect(metaCtaFor("Shop the collection")).toBe("SHOP_NOW");
    expect(metaCtaFor("Start your free trial")).toBe("SIGN_UP");
    expect(metaCtaFor("Book a demo")).toBe("BOOK_NOW");
    expect(metaCtaFor("Get a free quote")).toBe("GET_QUOTE");
    expect(metaCtaFor("Order tonight")).toBe("ORDER_NOW");
    expect(metaCtaFor("Learn more")).toBe("LEARN_MORE");
    expect(metaCtaFor("See how it works")).toBe("LEARN_MORE");
    expect(metaCtaFor("Vamos")).toBeNull();
    expect(metaCtaFor(null)).toBeNull();
  });

  it("hints placements by shape and keeps file extensions", () => {
    expect(placementsFor("9:16")).toEqual(["stories", "reels"]);
    expect(placementsFor("4:5")).toEqual(["feed"]);
    expect(creativeFilename("ad-01-problem_aware", "4:5", "image/jpeg")).toBe("ad-01-problem-aware-4x5.jpg");
    expect(creativeFilename("ozzy-v2", "9:16", "video/mp4")).toBe("ozzy-v2-9x16.mp4");
    expect(ratioOf(1080, 1920)).toBe("9:16");
    expect(ratioOf(1080, 1350)).toBe("4:5");
    expect(SHARE_LINK_SECONDS).toBe(604800);
  });

  it("clips at word boundaries", () => {
    expect(clip("short", 40)).toBe("short");
    const c = clip("This sentence is definitely longer than forty characters in total", 40);
    expect(c.length).toBeLessThanOrEqual(41);
    expect(c.endsWith("…")).toBe(true);
  });

  it("suggests launch copy from the shipped notes and the product URL", () => {
    const copy = suggestAdCopy({ kind: "launch", brandName: null, mainOffer: null, audience: null, ask: "Make a launch video for what we just shipped: https://cal.com\n\nWhat we shipped: Routing forms that send each lead to the right calendar.\nMake it 9:16.", landingUrl: "https://cal.com" });
    expect(copy.primary_text).toContain("Routing forms");
    expect(copy.primary_text).not.toContain("9:16");
    expect(copy.headline.length).toBeLessThanOrEqual(HEADLINE_MAX + 1);
    expect(copy.primary_text.length).toBeLessThanOrEqual(PRIMARY_TEXT_MAX + 1);
    expect(copy.cta_type).toBe("SIGN_UP");
    expect(copy.landing_url).toBe("https://cal.com");
  });

  it("suggests remix copy from the brand profile", () => {
    const copy = suggestAdCopy({ kind: "remix", brandName: "Fit2Run", mainOffer: "Running shoes from top brands, fitted in store.", audience: "local runners", ask: "Remix this ad for my brand: https://x", landingUrl: "https://www.fit2run.com/" });
    expect(copy.headline).toBe("Running shoes from top brands, fitted in…");
    expect(copy.primary_text).toContain("Made for local runners.");
    expect(copy.cta_type).toBe("SHOP_NOW");
  });
});

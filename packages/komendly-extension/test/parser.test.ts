import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { advertisersOf, findAdCards, findButtonAnchor, OWN_ATTR, parseAdCard, textWithBreaks } from "../src/parser";

const load = (name: string) => {
  document.documentElement.innerHTML = readFileSync(join(__dirname, "fixtures", name), "utf8").replace(/^<!doctype html>/i, "");
};
const byId = (id: string) => findAdCards(document.body).map(parseAdCard).find((a) => a?.libraryId === id)!;

describe("live Ad Library search fixture (q=plumber)", () => {
  beforeEach(() => load("ad-library-search-live.html"));

  it("finds one card per ad", () => {
    const cards = findAdCards(document.body);
    expect(cards).toHaveLength(11);
    expect(new Set(cards.map((c) => parseAdCard(c)!.libraryId)).size).toBe(11);
    // no card contains another card
    for (const a of cards) for (const b of cards) if (a !== b) expect(a.contains(b)).toBe(false);
  });

  it("reads a link ad: headline, description, CTA, destination, creative", () => {
    const ad = byId("2917866588581005");
    expect(ad).toMatchObject({
      libraryUrl: "https://www.facebook.com/ads/library/?id=2917866588581005",
      pageName: "Mountain Dew",
      pageUrl: "https://www.facebook.com/mountaindew/",
      pageId: "mountaindew",
      text: "Congrats and keep up the good work! #job #congrats #success",
      headline: "Find Dew®",
      cta: "Shop now",
      destinationUrl: "https://www.mountaindew.com/find-dew",
      videoUrl: null,
      multipleVersions: false,
    });
    expect(ad.description).toMatch(/^The original, the one that started it all/);
    expect(ad.imageUrl).toMatch(/^https:\/\/scontent[^"]+fbcdn\.net\/.+s600x600/);
  });

  it("skips the advertiser avatar and keeps line breaks in the body", () => {
    const ad = byId("1183982653790471");
    expect(ad.pageName).toBe("High Tide Plumbing");
    expect(ad.text).toMatch(/^Plumbing Myth: Busted\. 🚫\nNot everything/);
    expect(ad.headline).toBe("Flushable? Not Quite.");
    expect(ad.cta).toBe("Call now");
    expect(ad.destinationUrl).toBeNull();
    expect(ad.imageUrl).not.toMatch(/s60x60/);
  });

  it("uses the video poster as the image for video ads, and the brand for 'creator with brand' ads", () => {
    const ad = byId("1717653469447800");
    expect(ad.pageName).toBe("Thumbtack");
    expect(ad.pageId).toBe("Thumbtack");
    expect(ad.videoUrl).toMatch(/^https:\/\/video-.+\.mp4/);
    expect(ad.imageUrl).toMatch(/fbcdn\.net/);
    expect(ad.cta).toBe("Book now");
    expect(ad.destinationUrl).toBe("https://www.thumbtack.com/k/bathroom-remodeling/near-me/");
  });

  it("flags multiple versions and numeric page ids", () => {
    const ad = byId("892162017263437");
    expect(ad.multipleVersions).toBe(true);
    expect(ad.pageId).toBe("61583991106859");
    expect(ad.headline).toBe("Supplements for Blue-Collar Workers");
    expect(ad.destinationUrl).toBe("https://tradesmannutrition.com/pages/t-fuel");
  });

  it("every card has text, an image and a page", () => {
    for (const c of findAdCards(document.body)) {
      const ad = parseAdCard(c)!;
      expect(ad.text, ad.libraryId).toBeTruthy();
      expect(ad.imageUrl, ad.libraryId).toMatch(/^https:\/\//);
      expect(ad.pageUrl, ad.libraryId).toMatch(/^https:\/\/www\.facebook\.com\//);
      expect(ad.cta ?? "", ad.libraryId).not.toMatch(/see ad details/i);
    }
  });

  it("anchors the button right after 'See ad details' and ignores its own injected UI", () => {
    const card = findAdCards(document.body)[1]!;
    const before = parseAdCard(card);
    const { parent, before: next } = findButtonAnchor(card);
    expect(card.contains(parent)).toBe(true);
    const mine = document.createElement("div");
    mine.setAttribute(OWN_ATTR, "button");
    mine.innerHTML = `<div role="button">Remake for my business</div><img src="https://example.com/x_s600x600_.png"><div style="white-space: pre-wrap;">mine</div><span>Library ID: 99999999</span>`;
    parent.insertBefore(mine, next);
    expect(mine.previousElementSibling?.getAttribute("role")).toBe("none");
    expect(mine.previousElementSibling?.textContent).toBe("See ad details");
    expect(findAdCards(document.body)).toHaveLength(11);
    expect(parseAdCard(card)).toEqual(before);
  });

  it("lists distinct advertisers for the popup", () => {
    const list = advertisersOf(findAdCards(document.body).map(parseAdCard));
    expect(list.length).toBe(11);
    expect(list).toContainEqual({ name: "Mountain Dew", pageId: "mountaindew", pageUrl: "https://www.facebook.com/mountaindew/" });
  });
});

describe("hand-made single-ad fixture", () => {
  beforeEach(() => load("ad-library-single-handmade.html"));

  it("finds the single card without swallowing the page", () => {
    const cards = findAdCards(document.body);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.classList.contains("card")).toBe(true);
  });

  it("parses profile.php pages, video posters and message CTAs", () => {
    const ad = parseAdCard(findAdCards(document.body)[0]!)!;
    expect(ad).toEqual({
      libraryId: "555000111222333",
      libraryUrl: "https://www.facebook.com/ads/library/?id=555000111222333",
      pageName: "Sparkle Window Washing",
      pageUrl: "https://www.facebook.com/profile.php?id=100090000000001",
      pageId: "100090000000001",
      text: "Streak-free windows by Friday.\n\nBook before Sunday and get your screens cleaned free.",
      headline: "Clean windows, zero hassle",
      description: null,
      cta: "Send message",
      destinationUrl: null,
      imageUrl: "https://scontent.xx.fbcdn.net/v/t39.35426-6/2_n.jpg?_nc_cat=1",
      videoUrl: "https://video.xx.fbcdn.net/o1/v/t2/f2/m367/clip.mp4?_nc_cat=1",
      multipleVersions: false,
    });
  });

  it("returns null for elements that aren't ad cards", () => {
    expect(parseAdCard(document.querySelector(".filters")!)).toBeNull();
    expect(textWithBreaks(document.querySelector(".filters")!)).toBe("PlatformsFilters");
  });
});

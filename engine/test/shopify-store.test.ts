import { describe, expect, it, vi } from "vitest";
import { needsStoreData, shopifyStoreFrom, withStoreData } from "../src/jobs/extract/shopify-store";
import type { CrawlResult } from "../src/jobs/extract/crawl";

const store = {
  name: "Komendly Test Store",
  description: "Snowboards for every rider.",
  storeUrl: "https://komendly-test-store.myshopify.com",
  products: [
    { title: "The Minimal Snowboard", url: "https://komendly-test-store.myshopify.com/products/the-minimal-snowboard", description: "A light board for park days.", price: "$885.95", productType: "snowboard", imageUrl: "https://cdn.shopify.com/a.jpg", imageAlt: "" },
    { title: "Gift Card", url: "https://komendly-test-store.myshopify.com/products/gift-card", description: "", price: "$10.00", productType: "", imageUrl: null, imageAlt: "" },
  ],
};
const gate: CrawlResult = {
  finalUrl: "https://komendly-test-store.myshopify.com/password",
  pages: [{ url: "https://komendly-test-store.myshopify.com/password", title: "Komendly Test Store", description: "", og: {}, text: "Opening soon. Enter store password. This store is password protected and the owner has not launched it yet." }],
  colors: [{ hex: "#123456", weight: 1, where: "bg" }],
  fonts: [],
  logo: { sourceUrl: "https://cdn.shopify.com/logo.png", bytes: Buffer.from("x"), mime: "image/png" },
  images: [],
};

describe("shopify password-protected stores", () => {
  it("reads store data from the job payload and ignores junk", () => {
    expect(shopifyStoreFrom({ url: "x", shopifyStore: store })?.products).toHaveLength(2);
    expect(shopifyStoreFrom({ url: "x" })).toBeNull();
    expect(shopifyStoreFrom({ shopifyStore: { name: 1 } })).toBeNull();
    expect(shopifyStoreFrom(null)).toBeNull();
  });
  it("only steps in when the crawl hit the password gate or found nothing", () => {
    expect(needsStoreData(gate)).toBe(true);
    expect(needsStoreData(null)).toBe(true);
    const real = { ...gate, finalUrl: "https://shop.example.com/", pages: [{ ...gate.pages[0]!, url: "https://shop.example.com/", text: "x".repeat(400) }] };
    expect(needsStoreData(real)).toBe(false);
  });
  it("builds pages and photos from the store, keeping the theme look from the gate page", async () => {
    const download = vi.fn(async () => [{ sourceUrl: "https://cdn.shopify.com/a.jpg", width: 1000, height: 1000, alt: "The Minimal Snowboard", bytes: Buffer.from("i"), mime: "image/jpeg", thumb: Buffer.from("t") }]);
    const r = await withStoreData(gate, store, store.products[0]!.url, undefined, download);
    expect(r.finalUrl).toBe(store.products[0]!.url);
    expect(r.pages[0]!.url).toBe(store.products[0]!.url);
    expect(r.pages[0]!.text).toContain("Price: from $885.95");
    expect(r.pages.some((p) => p.text.includes("password"))).toBe(false);
    expect(r.colors).toEqual(gate.colors);
    expect(r.logo).toBe(gate.logo);
    expect(r.images).toHaveLength(1);
    expect((download.mock.calls as unknown as unknown[][])[0]![0]).toEqual([{ src: "https://cdn.shopify.com/a.jpg", w: 0, h: 0, alt: "The Minimal Snowboard" }]);
    const whole = await withStoreData(gate, store, "https://komendly-test-store.myshopify.com/", undefined, download);
    expect(whole.finalUrl).toBe(store.storeUrl);
  });
});
